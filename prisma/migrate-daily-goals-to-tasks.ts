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

  for (const goal of dailyGoals) {
    if (!goal.parentId) {
      console.warn(`  Skipping goal "${goal.title}" (${goal.id}) — no parent.`);
      skipped++;
      continue;
    }

    const taskStatus = STATUS_MAP[goal.status] ?? 'TODO';

    await prisma.$transaction([
      prisma.task.create({
        data: {
          ownerId: goal.stack.ownerId,
          goalId: goal.parentId, // Link to WEEKLY parent
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
    ]);

    migrated++;
    console.log(`  Migrated: "${goal.title}" → task (parent: ${goal.parentId})`);
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
