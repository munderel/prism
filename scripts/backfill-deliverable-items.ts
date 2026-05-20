// One-shot backfill: creates one DeliverableItem per Task that has a non-empty
// deliverable text field. This migrates the legacy free-text deliverable into
// the structured checkbox model introduced in Component 10.
//
// Idempotent: tasks that already have at least one DeliverableItem row are
// skipped entirely, so re-running is safe.
//
// Usage:
//   npx ts-node --project tsconfig.json scripts/backfill-deliverable-items.ts
//   npx ts-node --project tsconfig.json scripts/backfill-deliverable-items.ts --dry-run
//
// Run from the prism/ directory. Requires DATABASE_URL in environment.

import { prisma } from '../src/lib/prisma';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`[backfill-deliverable-items] Starting${isDryRun ? ' (DRY RUN)' : ''}…`);

  // Find all tasks with non-empty deliverable text
  const tasks = await prisma.task.findMany({
    where: {
      deliverable: { not: null },
      // Prisma doesn't support "not empty string" directly in all drivers, so
      // we filter in JS. Most tasks won't have deliverables, so the result set
      // stays small.
    },
    select: {
      id: true,
      deliverable: true,
      deliverableDone: true,
      _count: { select: { deliverableItems: true } },
    },
  });

  const candidates = tasks.filter(
    (t) => t.deliverable && t.deliverable.trim() !== '' && t._count.deliverableItems === 0,
  );

  console.log(
    `[backfill-deliverable-items] Found ${tasks.length} tasks with deliverable set; ` +
      `${candidates.length} need backfill (${tasks.length - candidates.length} already have items).`,
  );

  if (isDryRun) {
    console.log('[backfill-deliverable-items] DRY RUN — no writes performed.');
    return;
  }

  let created = 0;
  for (const task of candidates) {
    await prisma.deliverableItem.create({
      data: {
        taskId: task.id,
        text: task.deliverable as string,
        isDone: task.deliverableDone ?? false,
        position: 0,
      },
    });
    created++;
  }

  console.log(`[backfill-deliverable-items] Done. Created ${created} DeliverableItem rows.`);
}

main()
  .catch((err) => {
    console.error('[backfill-deliverable-items] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
