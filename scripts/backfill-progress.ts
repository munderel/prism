// One-shot recompute of every Goal's progressPct from current children/tasks/links.
// Useful after deploying the cascadeProgressUp manual-status fix to snap rows that
// were left stale (e.g., COMPLETED goals showing < 100%).
//
//   npm run backfill-progress

import { prisma } from '../src/lib/prisma';
import { cascadeProgressUp } from '../src/lib/progress';

async function main() {
  const goals = await prisma.goal.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  console.log(`[backfill-progress] Recomputing progress for ${goals.length} goal(s)...`);

  let done = 0;
  for (const goal of goals) {
    try {
      await cascadeProgressUp(goal.id);
      done++;
      if (done % 50 === 0) {
        console.log(`[backfill-progress] ${done}/${goals.length}`);
      }
    } catch (err) {
      console.warn(`[backfill-progress] Failed for goal ${goal.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[backfill-progress] Done. Recomputed ${done}/${goals.length} goals.`);
}

main()
  .catch((err) => {
    console.error('[backfill-progress] Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
