import { prisma } from '@/lib/prisma';
import { generateAdvancedModeTasks } from '@/lib/process-task-generator';

const PERIODS_AHEAD: Record<string, number> = {
  ONE_TIME: 1,
  DAILY: 5,
  WEEKLY: 4,
  BIWEEKLY: 4,
  MONTHLY: 3,
  QUARTERLY: 2,
  YEARLY: 1,
};

/**
 * Check for ADVANCED mode processes that need task replenishment.
 * Called on-demand from GET /api/tasks to avoid needing a cron job.
 *
 * BASIC mode processes are skipped — they use calendar events + completion tracking,
 * not pre-created tasks.
 */
export async function checkAndCreateDueProcessTasks(): Promise<void> {
  const now = new Date();

  const advancedProcesses = await prisma.process.findMany({
    where: { mode: 'ADVANCED' },
    select: { id: true, cadence: true },
  });

  if (advancedProcesses.length === 0) return;

  await Promise.all(
    advancedProcesses.map(async (process) => {
      const futureTasks = await prisma.task.count({
        where: {
          processId: process.id,
          status: 'TODO',
          dueDate: { gte: now },
        },
      });

      const target = PERIODS_AHEAD[process.cadence] ?? 4;
      if (futureTasks < target) {
        await generateAdvancedModeTasks(process.id);
      }
    })
  );
}
