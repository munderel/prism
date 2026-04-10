import { NextRequest } from 'next/server';
import { Prisma, TrainingType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { enrichTrainingProgress } from '@/lib/api-helpers';
import { parseBody, createTrainingItemSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // BOOK | COURSE
  const status = searchParams.get('status'); // ACTIVE | COMPLETED | ARCHIVED

  const where: Prisma.TrainingItemWhereInput = { ownerId: auth.userId };
  if (type) where.type = type as TrainingType;
  if (status) where.status = status;

  const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
  const offset = Number(searchParams.get('offset')) || 0;

  const items = await prisma.trainingItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      goal: { select: { id: true, title: true, level: true } },
      trainingTasks: {
        include: {
          task: { select: { id: true, title: true, status: true, dueDate: true, completedAt: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      _count: {
        select: { quizAttempts: true },
      },
    },
  });

  const enriched = items.map(enrichTrainingProgress);

  return Response.json(enriched);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createTrainingItemSchema);
  if ('error' in parsed) return parsed.error;
  const { title, type, description, targetCompletionDate, goalId } = parsed.data;

  // Validate goalId if provided
  if (goalId) {
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: { stack: true },
    });
    if (!goal || goal.deletedAt) {
      return Response.json({ error: 'Goal not found' }, { status: 404 });
    }
  }

  const item = await prisma.trainingItem.create({
    data: {
      ownerId: auth.userId,
      type,
      title,
      description: description ?? null,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : null,
      goalId: goalId ?? null,
    },
    include: {
      goal: { select: { id: true, title: true, level: true } },
    },
  });

  return Response.json(item, { status: 201 });
}
