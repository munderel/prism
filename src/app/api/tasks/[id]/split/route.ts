import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, hasAccess } from '@/lib/api-helpers';
import { parseBody } from '@/lib/schemas';

const splitSchema = z.object({
  sessions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        durationMinutes: z.number().int().min(1).max(1440).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * POST /api/tasks/[id]/split
 *
 * Splits a task into N child subtasks. Each subtask shares the parent's
 * type, priority, owner, goal, and process. Each subtask's title is what
 * the user is working on in that session.
 *
 * If the parent has a `timeBlockStart`/`timeBlockEnd`, those are cleared so
 * the parent stops appearing on the calendar (subtasks now own scheduling).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parent = await prisma.task.findUnique({ where: { id } });
  if (!parent) return notFoundResponse('Task');
  if (!hasAccess(parent.ownerId, auth.userId, auth.session.user.isAdmin)) {
    return forbiddenResponse();
  }

  const parsed = await parseBody(request, splitSchema);
  if ('error' in parsed) return parsed.error;
  const { sessions } = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    const newChildren = await Promise.all(
      sessions.map((s) =>
        tx.task.create({
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
            estimatedMinutes: s.durationMinutes ?? 60,
          },
        }),
      ),
    );

    // Clear the parent's own schedule so it stops appearing on the calendar
    // — subtasks now own scheduling. Leave dueDate as the deadline window.
    await tx.task.update({
      where: { id: parent.id },
      data: { timeBlockStart: null, timeBlockEnd: null },
    });

    return newChildren;
  });

  return Response.json({ subtasks: created });
}
