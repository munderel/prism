import { prisma } from '@/lib/prisma';
import { computeNextDueDate } from '@/lib/process-scheduler';

/**
 * Check for processes that are due and create maintenance tasks for them.
 * Called on-demand from /api/tasks GET to avoid needing a cron job.
 * Idempotent — skips processes that already have an execution today.
 */
export async function checkAndCreateDueProcessTasks() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dueProcesses = await prisma.process.findMany({
    where: { nextDueAt: { lte: now } },
    include: {
      assignee: { select: { id: true } },
      delegate: { select: { id: true } },
    },
  });

  if (dueProcesses.length === 0) return;

  await Promise.all(
    dueProcesses.map(async (process) => {
      let responsibleUserId: string | null = null;

      if (
        process.delegateId &&
        process.delegateUntil &&
        process.delegateUntil >= today
      ) {
        responsibleUserId = process.delegateId;
      } else if (process.assigneeId) {
        responsibleUserId = process.assigneeId;
      }

      if (!responsibleUserId) return;

      const existingExecution = await prisma.processExecution.findFirst({
        where: {
          processId: process.id,
          scheduledDate: { gte: today },
        },
      });
      if (existingExecution) return;

      await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            ownerId: responsibleUserId!,
            taskType: 'MAINTENANCE',
            title: process.title,
            description: process.description,
            dueDate: computeNextDueDate(process.cadence, now),
            status: 'TODO',
            priority: 'MEDIUM',
            estimatedMinutes: process.defaultDurationMinutes,
          },
        });

        await tx.processExecution.create({
          data: {
            processId: process.id,
            executedById: responsibleUserId,
            scheduledDate: now,
            taskId: task.id,
          },
        });

        await tx.process.update({
          where: { id: process.id },
          data: {
            lastRunAt: now,
            nextDueAt: computeNextDueDate(process.cadence, now),
          },
        });
      });
    })
  );
}
