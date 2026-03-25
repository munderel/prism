/**
 * Migration script: Convert DAILY goals to GOAL_STACK tasks.
 *
 * Run with: npx tsx prisma/migrate-daily-goals-to-tasks.ts
 *
 * For each DAILY goal:
 * 1. Creates a Task record (taskType=GOAL_STACK, linked to parent WEEKLY goal)
 * 2. Soft-deletes the DAILY goal (sets deletedAt)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATUS_MAP: Record<string, string> = {
  NOT_STARTED: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'DONE',
  ABANDONED: 'DROPPED',
};

async function main() {
  const dailyGoals = await prisma.goal.findMany({
    where: { level: 'DAILY', deletedAt: null },
    include: {
      stack: { select: { ownerId: true } },
    },
  });

  console.log(`Found ${dailyGoals.length} DAILY goals to migrate.`);

  let migrated = 0;
  let skipped = 0;

  const BATCH_SIZE = 50;
  const toMigrate = dailyGoals.filter((goal) => {
    if (!goal.parentId) {
      console.warn(`  Skipping goal "${goal.title}" (${goal.id}) — no parent.`);
      skipped++;
      return false;
    }
    return true;
  });

  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = toMigrate.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.flatMap((goal) => {
        const taskStatus = STATUS_MAP[goal.status] ?? 'TODO';
        return [
          prisma.task.create({
            data: {
              ownerId: goal.stack.ownerId,
              goalId: goal.parentId!,
              taskType: 'GOAL_STACK',
              title: goal.title,
              description: goal.description,
              status: taskStatus as any,
              priority: 'MEDIUM',
              dueDate: goal.dueDate,
              completedAt: goal.status === 'COMPLETED' ? new Date() : null,
            },
          }),
          prisma.goal.update({
            where: { id: goal.id },
            data: { deletedAt: new Date() },
          }),
        ];
      })
    );
    migrated += batch.length;
    console.log(`  Migrated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} goals`);
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
