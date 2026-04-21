import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, hasAccess } from '@/lib/api-helpers';
import { parseBody, splitTaskSchema } from '@/lib/schemas';

/**
 * POST /api/tasks/[id]/split
 *
 * Splits a task into N (>=2) child subtasks. Each child shares the parent's
 * type, priority, owner, goal, and process; its title is the session label.
 *
 * Rejects when the parent is in a state where splitting would orphan data:
 * - already has child subtasks (nested splits not supported),
 * - has any WorkBlock rows (scheduling would be stranded on the parent),
 * - has a TaskCompletionSnapshot (was completed at least once).
 *
 * On success: creates the children sequentially inside a $transaction so
 * createdAt ordering matches the input array, clears the parent's own
 * scheduling fields, and zeroes the parent's estimatedMinutes (children
 * carry the estimate now — leaving the parent's intact would double-count
 * in progress rollups).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parent = await prisma.task.findUnique({
    where: { id },
    include: {
      _count: { select: { workBlocks: true, children: true } },
      completionSnapshot: { select: { taskId: true } },
    },
  });
  if (!parent) return notFoundResponse('Task');
  if (!hasAccess(parent.ownerId, auth.userId, auth.session.user.isAdmin)) {
    return forbiddenResponse();
  }

  if (parent.parentId) {
    return Response.json(
      { error: 'Cannot split a subtask — split the top-level parent instead' },
      { status: 409 },
    );
  }
  if (parent._count.children > 0) {
    return Response.json(
      { error: 'Task already has subtasks; delete them first or edit them directly' },
      { status: 409 },
    );
  }
  if (parent._count.workBlocks > 0) {
    return Response.json(
      {
        error:
          'Task has scheduled work blocks. Delete the work blocks first, then split, and reschedule on the new subtasks.',
      },
      { status: 409 },
    );
  }
  if (parent.completionSnapshot) {
    return Response.json(
      { error: 'Task has already been completed; cannot split after completion' },
      { status: 409 },
    );
  }

  const parsed = await parseBody(request, splitTaskSchema);
  if ('error' in parsed) return parsed.error;
  const { sessions } = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    const newChildren: Awaited<ReturnType<typeof tx.task.create>>[] = [];
    // Sequential — Promise.all does not guarantee createdAt ordering, but the
    // user typed titles in order ("Outline, Draft, Edit") and expects that
    // order to be preserved.
    for (const s of sessions) {
      const child = await tx.task.create({
        data: {
          ownerId: parent.ownerId,
          assigneeId: parent.assigneeId,
          goalId: parent.goalId,
          processId: parent.processId,
          parentId: parent.id,
          taskType: parent.taskType,
          priority: parent.priority,
          title: s.title,
          description: parent.description,
          estimatedMinutes: s.durationMinutes,
        },
      });
      newChildren.push(child);
    }

    // Clear parent scheduling and zero its estimate so progress rollups
    // don't double-count. Leave dueDate intact as the deadline window.
    await tx.task.update({
      where: { id: parent.id },
      data: { timeBlockStart: null, timeBlockEnd: null, estimatedMinutes: 0 },
    });

    return newChildren;
  });

  return Response.json({ subtasks: created });
}
