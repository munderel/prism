import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { completeTask, TaskNotFoundError } from '@/lib/task-completion';

// Marks a task DONE with a snapshot of time/goal progress at that moment.
// Idempotent: a second POST on an already-DONE task returns the existing
// snapshot without flipping any newly-added PENDING work blocks.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);
  const { id: taskId } = await params;

  // Authorize: caller must own or be assigned to the task.
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [{ ownerId: auth.userId }, { assigneeId: auth.userId }],
    },
    select: { id: true },
  });
  if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

  try {
    const result = await completeTask(taskId, auth.userId);
    return Response.json({ ok: true, snapshot: result.snapshot, alreadyCompleted: result.alreadyCompleted }, NO_STORE);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    throw err;
  }
}
