import { prisma } from '@/lib/prisma';
import { generateTasksForCurrentPeriod } from '@/lib/process-task-generator';

/**
 * For each ADVANCED process, lazily create tasks for the current period if
 * none exist yet. Called on every GET /api/tasks — idempotent. Expired
 * processes are skipped by the generator itself.
 */
export async function checkAndCreateDueProcessTasks(): Promise<void> {
  const processes = await prisma.process.findMany({
    where: {
      OR: [
        { mode: 'ADVANCED' },
        { mode: 'BASIC', scheduledTime: { not: null } },
      ],
    },
    select: { id: true },
  });

  if (processes.length === 0) return;

  await Promise.all(processes.map((p) => generateTasksForCurrentPeriod(p.id)));
}
