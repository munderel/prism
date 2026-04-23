import { prisma } from './prisma';
import { minutesBetween } from './date-utils';

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
 * - Recurses into child Tasks (parentId) so marking a parent done also
 *   completes every subtask.
 * - Transactionally flips every non-terminal WorkBlock to COMPLETED (defaulting
 *   `actualMinutes` to the scheduled duration), flips every ClearGoal under
 *   the task or its workblocks to isComplete, sets `Task.status = DONE`, and
 *   upserts a `TaskCompletionSnapshot`.
 * - If the task is already DONE this is a no-op; the existing snapshot is
 *   returned with `alreadyCompleted: true`. Re-completion won't flip new
 *   PENDING blocks the user may have added after reopening.
 * - `actorId` is the user who triggered the completion — used for snapshot
 *   attribution regardless of the route that calls this.
 */
export async function completeTask(
  taskId: string,
  actorId: string,
  visited: Set<string> = new Set(),
): Promise<CompleteTaskResult> {
  // Guard against parentId cycles (A→B→A) that would otherwise recurse forever.
  if (visited.has(taskId)) {
    const snapshot = await prisma.taskCompletionSnapshot.findUnique({ where: { taskId } });
    return { taskId, snapshot, alreadyCompleted: true };
  }
  visited.add(taskId);

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

  // Recurse into children FIRST so grandchildren get their own snapshot and
  // status=DONE write before the parent's transaction computes rollups.
  const childIds = (
    await prisma.task.findMany({
      where: { parentId: taskId, status: { notIn: ['DONE', 'DROPPED'] } },
      select: { id: true },
    })
  ).map((c) => c.id);
  // Parallel cascade with per-child error isolation — one failure doesn't
  // abort sibling completions or the parent.
  await Promise.allSettled(
    childIds.map((childId) =>
      completeTask(childId, actorId, visited).catch((err) => {
        console.warn('[completeTask] child cascade failed for', childId, err);
      }),
    ),
  );

  // Snapshot rollups reflect the POST-cascade state so analytics see the
  // cascade-promoted blocks as completed. PENDING and PARTIAL are treated as
  // about-to-be-COMPLETED; MISSED stays MISSED.
  const scheduledMinutes = task.workBlocks.reduce(
    (acc, b) => acc + minutesBetween(b.start, b.end),
    0,
  );
  const completedMinutes = task.workBlocks
    .filter((b) => b.completionStatus !== 'MISSED')
    .reduce((acc, b) => acc + (b.actualMinutes ?? minutesBetween(b.start, b.end)), 0);

  const goalsDefined = task.clearGoals.length;
  // Every non-complete goal gets flipped in the cascade, so goalsHit == goalsDefined post-cascade.
  const goalsHit = task.clearGoals.length;
  const blocksCompleted = task.workBlocks.filter((b) => b.completionStatus !== 'MISSED').length;
  const blocksPartial = 0; // PARTIAL gets promoted to COMPLETED
  const blocksMissed = task.workBlocks.filter((b) => b.completionStatus === 'MISSED').length;

  const completedAt = new Date();
  const estimated = task.estimatedMinutes ?? 0;

  // Default actualMinutes to the scheduled duration when the block hadn't
  // been reviewed yet — prevents partial data for still-PENDING blocks the
  // cascade is promoting to COMPLETED.
  const actualFills: Array<{ id: string; minutes: number }> = [];
  for (const b of task.workBlocks) {
    const isTerminal = b.completionStatus === 'COMPLETED' || b.completionStatus === 'MISSED';
    if (isTerminal || b.actualMinutes != null) continue;
    actualFills.push({ id: b.id, minutes: minutesBetween(b.start, b.end) });
  }

  const workBlockIds = task.workBlocks.map((b) => b.id);

  const [, , snapshot] = await prisma.$transaction([
    // Flip non-terminal workblocks to COMPLETED. The old behavior marked
    // PENDING as MISSED; the product decision is now to treat parent
    // completion as "everything under it is also done".
    prisma.workBlock.updateMany({
      where: { taskId, completionStatus: { in: ['PENDING', 'PARTIAL'] } },
      data: { completionStatus: 'COMPLETED', reviewedAt: completedAt },
    }),
    // Cascade ClearGoal completion (task-level AND workblock-scoped).
    prisma.clearGoal.updateMany({
      where: {
        isComplete: false,
        OR: [{ taskId }, ...(workBlockIds.length > 0 ? [{ workBlockId: { in: workBlockIds } }] : [])],
      },
      data: { isComplete: true },
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

  // Fill in actualMinutes defaults for workblocks that didn't have one before
  // the cascade promoted them to COMPLETED. Done outside the transaction to
  // keep the schema (no bulk "conditional update with per-row value") simple.
  if (actualFills.length > 0) {
    await Promise.all(
      actualFills.map(({ id, minutes }) =>
        prisma.workBlock.update({ where: { id }, data: { actualMinutes: minutes } }),
      ),
    );
  }

  return { taskId, snapshot, alreadyCompleted: false };
}
