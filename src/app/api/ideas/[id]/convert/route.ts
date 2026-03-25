import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

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

  if (!idea) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (idea.status === 'CONVERTED') {
    return Response.json({ error: 'Idea has already been converted' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { ownerId, priority, dueDate } = body;

  // Determine owner: explicit ownerId > process assignee > idea author
  const taskOwnerId = ownerId ?? idea.process?.assigneeId ?? idea.authorId;

  // Create a REACT task from the idea in a transaction
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
        author: { select: { id: true, name: true, image: true } },
        process: { select: { id: true, title: true } },
        task: { select: { id: true, title: true, status: true, ownerId: true } },
      },
    });

    return { idea: updatedIdea, task };
  });

  return Response.json(result, { status: 201 });
}
