import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, createClearGoalSchema, updateClearGoalsSchema } from '@/lib/schemas';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const clearGoals = await prisma.clearGoal.findMany({
    where: { taskId },
    orderBy: { sortOrder: 'asc' },
  });

  return Response.json(clearGoals);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createClearGoalSchema);
  if ('error' in parsed) return parsed.error;
  const { text, powerdownId } = parsed.data;

  const maxOrder = await prisma.clearGoal.aggregate({
    where: { taskId },
    _max: { sortOrder: true },
  });

  const clearGoal = await prisma.clearGoal.create({
    data: {
      taskId,
      text: text.trim(),
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      createdInPowerdownId: powerdownId ?? null,
    },
  });

  return Response.json(clearGoal, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, updateClearGoalsSchema);
  if ('error' in parsed) return parsed.error;
  const { goals } = parsed.data;

  await prisma.$transaction(
    goals.map((goal) =>
      prisma.clearGoal.update({
        where: { id: goal.id },
        data: {
          ...(goal.text !== undefined && { text: goal.text }),
          ...(goal.isComplete !== undefined && { isComplete: goal.isComplete }),
          ...(goal.sortOrder !== undefined && { sortOrder: goal.sortOrder }),
        },
      })
    )
  );

  const updated = await prisma.clearGoal.findMany({
    where: { taskId },
    orderBy: { sortOrder: 'asc' },
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get('goalId');

  if (!goalId) {
    return Response.json({ error: 'goalId is required' }, { status: 400 });
  }

  await prisma.clearGoal.delete({
    where: { id: goalId },
  });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
