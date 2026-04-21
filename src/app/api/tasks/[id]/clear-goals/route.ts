import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';
import { parseBody, createClearGoalSchema, updateClearGoalsSchema } from '@/lib/schemas';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
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
  const auth = await requireTaskAccess(taskId);
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
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, updateClearGoalsSchema);
  if ('error' in parsed) return parsed.error;
  const { goals } = parsed.data;

  // Constrain each update to this task so a hostile client can't pass a
  // clearGoal.id that lives under a different task — updateMany with a
  // composite predicate is a noop when the row isn't on this task.
  await prisma.$transaction(
    goals.map((goal) =>
      prisma.clearGoal.updateMany({
        where: { id: goal.id, taskId },
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get('goalId');

  if (!goalId) {
    return Response.json({ error: 'goalId is required' }, { status: 400 });
  }

  // deleteMany with composite predicate so only clearGoals on this task can
  // be removed. A miss returns { count: 0 }, not 404 — consistent with the
  // idempotent contract the existing client relies on.
  await prisma.clearGoal.deleteMany({
    where: { id: goalId, taskId },
  });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
