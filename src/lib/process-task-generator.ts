import { ProcessCadence } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computeNextDueDate } from '@/lib/process-scheduler';

/**
 * Number of periods to pre-create, scaled by cadence.
 */
const PERIODS_AHEAD: Record<ProcessCadence, number> = {
  ONE_TIME: 1,
  DAILY: 5,
  WEEKLY: 4,
  BIWEEKLY: 4,
  MONTHLY: 3,
  QUARTERLY: 2,
  YEARLY: 1,
};

/**
 * Determine the responsible user for a process, considering delegation.
 */
function getResponsibleUserId(
  process: { assigneeId: string | null; delegateId: string | null; delegateUntil: Date | null }
): string | null {
  const today = new Date();
  if (process.delegateId && process.delegateUntil && process.delegateUntil >= today) {
    return process.delegateId;
  }
  return process.assigneeId;
}

/**
 * Delete all future TODO tasks and their incomplete executions for a process.
 * Preserves IN_PROGRESS and DONE tasks.
 */
export async function cleanupFutureProcessTasks(processId: string): Promise<void> {
  const now = new Date();

  // Find future TODO tasks linked to this process
  const futureTasks = await prisma.task.findMany({
    where: {
      processId,
      status: 'TODO',
      dueDate: { gte: now },
    },
    select: { id: true },
  });

  if (futureTasks.length === 0) return;

  const taskIds = futureTasks.map((t) => t.id);

  await prisma.$transaction([
    // Delete subtasks of those future tasks
    prisma.task.deleteMany({
      where: { parentId: { in: taskIds } },
    }),
    // Delete incomplete executions linked to those tasks
    prisma.processExecution.deleteMany({
      where: {
        taskId: { in: taskIds },
        completedAt: null,
      },
    }),
    // Delete the tasks themselves
    prisma.task.deleteMany({
      where: { id: { in: taskIds } },
    }),
  ]);
}

/**
 * Pre-create MAINTENANCE tasks for an ADVANCED mode process.
 * Creates tasks for multiple periods ahead based on cadence.
 * Idempotent — only creates tasks up to the target count.
 */
export async function generateAdvancedModeTasks(processId: string): Promise<number> {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      steps: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!process || process.mode !== 'ADVANCED') return 0;

  const responsibleUserId = getResponsibleUserId(process);
  if (!responsibleUserId) return 0;

  const now = new Date();
  const targetPeriods = PERIODS_AHEAD[process.cadence] ?? 4;

  // Count existing future TODO tasks for this process
  const existingFutureCount = await prisma.task.count({
    where: {
      processId,
      status: 'TODO',
      dueDate: { gte: now },
    },
  });

  const periodsToCreate = targetPeriods - existingFutureCount;
  if (periodsToCreate <= 0) return 0;

  // Find the latest scheduled date to start from
  const latestExecution = await prisma.processExecution.findFirst({
    where: { processId },
    orderBy: { scheduledDate: 'desc' },
    select: { scheduledDate: true },
  });

  let startFrom = latestExecution?.scheduledDate ?? process.nextDueAt ?? now;
  // If startFrom is in the past, use now
  if (startFrom < now) startFrom = now;

  let created = 0;
  let currentDate = startFrom;

  for (let i = 0; i < periodsToCreate; i++) {
    const dueDate = computeNextDueDate(process.cadence, currentDate);

    await prisma.$transaction(async (tx) => {
      // Create parent MAINTENANCE task
      const task = await tx.task.create({
        data: {
          ownerId: responsibleUserId,
          taskType: 'MAINTENANCE',
          title: process.title,
          description: process.description,
          dueDate,
          status: 'TODO',
          priority: 'MEDIUM',
          estimatedMinutes: process.defaultDurationMinutes,
          processId,
        },
      });

      // Create ProcessExecution linked to this task
      await tx.processExecution.create({
        data: {
          processId,
          executedById: responsibleUserId,
          scheduledDate: dueDate,
          taskId: task.id,
        },
      });

      // Create subtasks from process steps
      if (process.steps.length > 0) {
        if (process.subtaskMode === 'PAIRED') {
          // Paired: child tasks with parentId (embedded checklist)
          await Promise.all(
            process.steps.map((step) =>
              tx.task.create({
                data: {
                  ownerId: responsibleUserId,
                  taskType: 'MAINTENANCE',
                  title: step.title,
                  description: step.description,
                  dueDate,
                  status: 'TODO',
                  priority: 'MEDIUM',
                  parentId: task.id,
                  processId,
                },
              })
            )
          );
        } else {
          // Unpaired: independent tasks (no parentId), separately schedulable
          await Promise.all(
            process.steps.map((step) =>
              tx.task.create({
                data: {
                  ownerId: responsibleUserId,
                  taskType: 'MAINTENANCE',
                  title: step.title,
                  description: step.description,
                  dueDate,
                  status: 'TODO',
                  priority: 'MEDIUM',
                  processId,
                },
              })
            )
          );
        }
      }
    });

    currentDate = dueDate;
    created++;
  }

  // Update process.nextDueAt to the farthest scheduled date
  await prisma.process.update({
    where: { id: processId },
    data: { nextDueAt: currentDate },
  });

  return created;
}

/**
 * Regenerate tasks for an ADVANCED process.
 * Cleans up future TODO tasks and re-creates them.
 */
export async function regenerateAdvancedModeTasks(processId: string): Promise<number> {
  await cleanupFutureProcessTasks(processId);
  return generateAdvancedModeTasks(processId);
}

/**
 * Update the owner of all future TODO tasks for a process.
 * Called when assignee or delegate changes.
 */
export async function updateFutureTaskOwners(processId: string, newOwnerId: string): Promise<void> {
  const now = new Date();
  await prisma.task.updateMany({
    where: {
      processId,
      status: 'TODO',
      dueDate: { gte: now },
    },
    data: { ownerId: newOwnerId },
  });
}
