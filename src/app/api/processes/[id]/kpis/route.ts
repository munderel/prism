import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { authorizeProcessAccess, safeParseJson, validateKpiGoals } from '@/lib/api-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const kpis = await prisma.processKpi.findMany({
    where: { processId: id },
    include: {
      entries: {
        orderBy: { date: 'desc' },
        take: 30,
        include: { user: { select: { id: true, name: true } } },
      },
      goals: true,
      goal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(kpis);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, unit, targetValue, goalId, goals } = body;

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  if (Array.isArray(goals) && goals.length > 0) {
    const goalsError = validateKpiGoals(goals, Object.values(KpiTimeLevel) as string[]);
    if (goalsError) return Response.json({ error: goalsError }, { status: 400 });
  }

  const kpiWithGoals = await prisma.$transaction(async (tx) => {
    const kpi = await tx.processKpi.create({
      data: {
        processId: id,
        name,
        unit: unit || null,
        targetValue: targetValue ?? null,
        goalId: goalId || null,
      },
    });

    if (Array.isArray(goals) && goals.length > 0) {
      await tx.processKpiGoal.createMany({
        data: goals.map((g: { timeLevel: string; targetValue: number }) => ({
          kpiId: kpi.id,
          timeLevel: g.timeLevel as KpiTimeLevel,
          targetValue: g.targetValue,
        })),
      });
    }

    return tx.processKpi.findUnique({
      where: { id: kpi.id },
      include: { goals: true, goal: { select: { id: true, title: true } } },
    });
  });

  return Response.json(kpiWithGoals, { status: 201 });
}
