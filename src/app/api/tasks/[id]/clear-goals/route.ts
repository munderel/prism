import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

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

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { text, powerdownId } = parsed.data;

  if (!text?.trim()) {
    return Response.json({ error: 'Text is required' }, { status: 400 });
  }

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

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { goals } = parsed.data;

  if (!Array.isArray(goals)) {
    return Response.json({ error: 'goals array is required' }, { status: 400 });
  }

  await prisma.$transaction(
    goals.map((goal: { id: string; text?: string; isComplete?: boolean; sortOrder?: number }) =>
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
