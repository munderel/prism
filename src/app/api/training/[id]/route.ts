import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { enrichTrainingProgress, pickDefined, notFoundResponse, hasAccess, forbiddenResponse, safeParseJson, NO_STORE } from '@/lib/api-helpers';

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

  if (!item) return notFoundResponse('Training item');
  if (!hasAccess(item.ownerId, auth.userId, auth.session.user.isAdmin)) return forbiddenResponse();

  return Response.json(enrichTrainingProgress(item));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.trainingItem.findUnique({ where: { id } });
  if (!existing) return notFoundResponse('Training item');
  if (!hasAccess(existing.ownerId, auth.userId, auth.session.user.isAdmin)) return forbiddenResponse();

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { targetCompletionDate, goalId } = body;

  const data: any = pickDefined(body, ['title', 'description', 'status']);
  if (targetCompletionDate !== undefined) {
    data.targetCompletionDate = targetCompletionDate ? new Date(targetCompletionDate) : null;
  }
  if (goalId !== undefined) data.goalId = goalId || null;

  const updated = await prisma.trainingItem.update({
    where: { id },
    data,
    include: {
      goal: { select: { id: true, title: true, level: true } },
    },
  });

  return Response.json(updated, NO_STORE);
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
  if (!existing) return notFoundResponse('Training item');
  if (!hasAccess(existing.ownerId, auth.userId, auth.session.user.isAdmin)) return forbiddenResponse();

  const taskIds = existing.trainingTasks.map((tt) => tt.taskId);

  const operations = [
    prisma.trainingItem.delete({ where: { id } }),
  ];
  if (taskIds.length > 0) {
    operations.push(prisma.task.deleteMany({ where: { id: { in: taskIds } } }));
  }
  await prisma.$transaction(operations);

  return Response.json({ ok: true }, NO_STORE);
}
