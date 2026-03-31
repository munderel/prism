import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson, USER_SUMMARY_SELECT } from '@/lib/api-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      process: { select: { id: true, title: true, assigneeId: true } },
    },
  });

  if (!idea) return notFoundResponse('Idea');

  if (idea.status === 'CONVERTED') {
    return Response.json({ error: 'Idea has already been converted' }, { status: 400 });
  }

  const parsed = await safeParseJson(request);
  const body = 'error' in parsed ? {} : parsed.data;
  const { ownerId, priority, dueDate } = body as Record<string, any>;

  const taskOwnerId = ownerId ?? idea.process?.assigneeId ?? idea.authorId;

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        ownerId: taskOwnerId,
        taskType: 'REACT',
        title: idea.title,
        description: idea.description,
        processId: idea.processId ?? null,
        priority: priority ?? 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedMinutes: 60,
      },
    });

    const updatedIdea = await tx.idea.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        taskId: task.id,
      },
      include: {
        author: { select: USER_SUMMARY_SELECT },
        process: { select: { id: true, title: true } },
        task: { select: { id: true, title: true, status: true, ownerId: true } },
      },
    });

    return { idea: updatedIdea, task };
  });

  return Response.json(result, { status: 201 });
}
