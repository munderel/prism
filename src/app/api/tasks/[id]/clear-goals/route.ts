import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

/**
 * GET /api/tasks/[id]/clear-goals
 * Get all clear goals for a task.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const clearGoals = await prisma.clearGoal.findMany({
    where: { taskId: params.id },
    orderBy: { sortOrder: 'asc' },
  });

  return Response.json(clearGoals);
}

/**
 * POST /api/tasks/[id]/clear-goals
 * Create a new clear goal for a task.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { text, powerdownId } = body;
  if (!text?.trim()) {
    return Response.json({ error: 'Text is required' }, { status: 400 });
  }

  // Get the next sort order
  const maxOrder = await prisma.clearGoal.aggregate({
    where: { taskId: params.id },
    _max: { sortOrder: true },
  });

  const clearGoal = await prisma.clearGoal.create({
    data: {
      taskId: params.id,
      text: text.trim(),
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      createdInPowerdownId: powerdownId ?? null,
    },
  });

  return Response.json(clearGoal, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * PATCH /api/tasks/[id]/clear-goals
 * Bulk update clear goals (reorder, toggle, edit text).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { goals } = body;
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
    where: { taskId: params.id },
    orderBy: { sortOrder: 'asc' },
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * DELETE /api/tasks/[id]/clear-goals
 * Delete a specific clear goal by goalId in query param.
 */
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
