import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';

// Marks a task DONE with a snapshot of time/goal progress at that moment.
// - Creates (or upserts) a TaskCompletionSnapshot capturing estimate vs actual, goals hit/defined, overrun.
// - Flips any PENDING work blocks for this task to MISSED.
// - Sets Task.status = DONE, Task.completedAt = now.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id: taskId } = await params;

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [{ ownerId: auth.userId }, { assigneeId: auth.userId }],
    },
    include: {
      workBlocks: true,
      clearGoals: true,
    },
  });
  if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

  const scheduledMinutes = task.workBlocks.reduce((acc, b) => {
    return acc + Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60000));
  }, 0);

  const completedMinutes = task.workBlocks
    .filter((b) => b.completionStatus === 'COMPLETED' || b.completionStatus === 'PARTIAL')
    .reduce((acc, b) => {
      if (b.actualMinutes != null) return acc + b.actualMinutes;
      return acc + Math.max(0, Math.round((b.end.getTime() - b.start.getTime()) / 60000));
    }, 0);

  const goalsDefined = task.clearGoals.length;
  const goalsHit = task.clearGoals.filter((g) => g.isComplete).length;

  const blocksCompleted = task.workBlocks.filter((b) => b.completionStatus === 'COMPLETED').length;
  const blocksPartial = task.workBlocks.filter((b) => b.completionStatus === 'PARTIAL').length;
  const blocksMissed = task.workBlocks.filter((b) => b.completionStatus === 'MISSED').length;

  const completedAt = new Date();
  const estimated = task.estimatedMinutes ?? 0;

  const [, snapshot] = await prisma.$transaction([
    // Flip any still-pending blocks to MISSED
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
        userId: auth.userId,
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

  return Response.json({ ok: true, snapshot }, NO_STORE);
}
