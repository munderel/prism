// One-shot recompute of every Goal's progressPct from current children/tasks/links.
// Useful after deploying the cascadeProgressUp manual-status fix to snap rows that
// were left stale (e.g., COMPLETED goals showing < 100%).
//
// Strategy:
//   - Iterate only leaf goals (children.length === 0). cascadeProgressUp walks
//     upward from the starting node, so leaves alone cover the whole tree
//     and we avoid recomputing parents repeatedly.
//   - Run leaves through a bounded-concurrency pool so the DB isn't idle.
//   - Wrap each leaf in advisoryLock keyed by its root goal id. Sibling leaves
//     under the same root then serialize their ancestor updates (no last-
//     write-wins races); leaves under unrelated roots run in parallel.
//
//   npm run backfill-progress

import { prisma } from '../src/lib/prisma';
import { cascadeProgressUp } from '../src/lib/progress';
import { advisoryLock } from '../src/lib/concurrency';

// The Prisma singleton caps the pool at 5 connections per instance (see CLAUDE.md).
// Each in-flight leaf holds 1 lock-transaction connection AND the cascade itself
// uses another. Keep CONCURRENCY conservative; raise it only after observing
// pool headroom.
const CONCURRENCY = 4;

async function main() {
  const allGoals = await prisma.goal.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      parentId: true,
      children: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  const parentMap = new Map(allGoals.map((g) => [g.id, g.parentId]));
  const leaves = allGoals.filter((g) => g.children.length === 0);

  function rootOf(id: string): string {
    let cur = id;
    // Bounded walk; matches the spirit of cascadeProgressUp's max-depth=20.
    for (let depth = 0; depth < 50; depth++) {
      const parent = parentMap.get(cur);
      if (!parent) return cur;
      cur = parent;
    }
    return cur;
  }

  const tasks = leaves.map((l) => ({ leafId: l.id, rootId: rootOf(l.id) }));
  const total = tasks.length;

  console.log(
    `[backfill-progress] Recomputing progress from ${total} leaf(s) ` +
      `(out of ${allGoals.length} total goals) with concurrency=${CONCURRENCY}...`,
  );

  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < total) {
      const i = cursor++;
      const { leafId, rootId } = tasks[i];
      try {
        await advisoryLock(`backfill-progress:root:${rootId}`, async () => {
          await cascadeProgressUp(leafId);
        });
      } catch (err) {
        console.warn(
          `[backfill-progress] Failed for leaf ${leafId}:`,
          err instanceof Error ? err.message : err,
        );
      }
      done++;
      if (done % 50 === 0) {
        console.log(`[backfill-progress] ${done}/${total}`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`[backfill-progress] Done. Recomputed progress from ${done}/${total} leaves.`);
}

main()
  .catch((err) => {
    console.error('[backfill-progress] Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
