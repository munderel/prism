import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const item = await prisma.trainingItem.findUnique({
    where: { id },
    include: {
      goal: { select: { id: true, title: true, level: true } },
      trainingTasks: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
              completedAt: true,
              priority: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      quizAttempts: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          score: true,
          completedAt: true,
          createdAt: true,
          trainingTaskId: true,
        },
      },
    },
  });

  if (!item) {
    return Response.json({ error: 'Training item not found' }, { status: 404 });
  }

  if (item.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const totalTasks = item.trainingTasks.length;
  const completedTasks = item.trainingTasks.filter(
    (tt) => tt.task.status === 'DONE'
  ).length;

  return Response.json({
    ...item,
    totalTasks,
    completedTasks,
    progressPct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.trainingItem.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'Training item not found' }, { status: 404 });
  }
  if (existing.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, targetCompletionDate, goalId, status } = body;

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (targetCompletionDate !== undefined) {
    data.targetCompletionDate = targetCompletionDate ? new Date(targetCompletionDate) : null;
  }
  if (goalId !== undefined) data.goalId = goalId || null;
  if (status !== undefined) data.status = status;

  const updated = await prisma.trainingItem.update({
    where: { id },
    data,
    include: {
      goal: { select: { id: true, title: true, level: true } },
    },
  });

  return Response.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.trainingItem.findUnique({
    where: { id },
    include: { trainingTasks: { select: { taskId: true } } },
  });
  if (!existing) {
    return Response.json({ error: 'Training item not found' }, { status: 404 });
  }
  if (existing.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete linked Task records too (they were created by the training system)
  const taskIds = existing.trainingTasks.map((tt) => tt.taskId);

  await prisma.$transaction([
    // TrainingTasks and QuizAttempts cascade from TrainingItem delete
    prisma.trainingItem.delete({ where: { id } }),
    // Also remove the actual Task records
    ...(taskIds.length > 0
      ? [prisma.task.deleteMany({ where: { id: { in: taskIds } } })]
      : []),
  ]);

  return Response.json({ success: true });
}
