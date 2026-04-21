import { prisma } from './prisma';

export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'TaskNotFoundError';
  }
}

export interface CompleteTaskResult {
  taskId: string;
  snapshot: Awaited<ReturnType<typeof prisma.taskCompletionSnapshot.findUnique>>;
  alreadyCompleted: boolean;
}

/**
 * Completes a task atomically and idempotently.
 *
 * - Transactionally flips the task's PENDING work blocks to MISSED, updates
 *   `Task.status = DONE`, and upserts a `TaskCompletionSnapshot` that captures
 *   scheduled vs completed minutes, goal hits, and per-block outcomes.
 * - If the task is already DONE this is a no-op; the existing snapshot is
 *   returned with `alreadyCompleted: true`. This prevents surprise MISSED
 *   flips on re-completion when the user has reopened the task and added new
 *   PENDING blocks.
 * - The snapshot's `userId` is always the `actorId` (the user who triggered
 *   the completion), so the attribution is consistent across both
 *   `/api/tasks/[id]/complete` and `/api/tasks/[id]` PATCH paths.
 */
export async function completeTask(taskId: string, actorId: string): Promise<CompleteTaskResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { workBlocks: true, clearGoals: true },
  });

  if (!task) throw new TaskNotFoundError();

  if (task.status === 'DONE') {
    const snapshot = await prisma.taskCompletionSnapshot.findUnique({
      where: { taskId },
    });
    return { taskId, snapshot, alreadyCompleted: true };
  }

  const scheduledMinutes = task.workBlocks.reduce(
    (acc, b) => acc + Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60000)),
    0,
  );
  const completedMinutes = task.workBlocks
    .filter((b) => b.completionStatus === 'COMPLETED' || b.completionStatus === 'PARTIAL')
    .reduce(
      (acc, b) =>
        acc +
        (b.actualMinutes ?? Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60000))),
      0,
    );

  const goalsDefined = task.clearGoals.length;
  const goalsHit = task.clearGoals.filter((g) => g.isComplete).length;
  const blocksCompleted = task.workBlocks.filter((b) => b.completionStatus === 'COMPLETED').length;
  const blocksPartial = task.workBlocks.filter((b) => b.completionStatus === 'PARTIAL').length;
  const blocksMissed = task.workBlocks.filter((b) => b.completionStatus === 'MISSED').length;

  const completedAt = new Date();
  const estimated = task.estimatedMinutes ?? 0;

  const [, snapshot] = await prisma.$transaction([
    prisma.workBlock.updateMany({
      where: { taskId, completionStatus: 'PENDING' },
      data: { completionStatus: 'MISSED', reviewedAt: completedAt },
    }),
    prisma.taskCompletionSnapshot.upsert({
      where: { taskId },
      update: {
        completedAt,
        estimatedMinutes: estimated,
        completedMinutes,
        scheduledMinutes,
        goalsHit,
        goalsDefined,
        overrunMinutes: completedMinutes - estimated,
        blocksCompleted,
        blocksMissed,
        blocksPartial,
      },
      create: {
        taskId,
        userId: actorId,
        completedAt,
        estimatedMinutes: estimated,
        completedMinutes,
        scheduledMinutes,
        goalsHit,
        goalsDefined,
        overrunMinutes: completedMinutes - estimated,
        blocksCompleted,
        blocksMissed,
        blocksPartial,
      },
    }),
    prisma.task.update({
      where: { id: taskId },
      data: { status: 'DONE', completedAt },
    }),
  ]);

  return { taskId, snapshot, alreadyCompleted: false };
}
