import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, safeParseJson } from '@/lib/api-helpers';

async function authorizeProcessAccess(processId: string, userId: string, isAdmin: boolean) {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    select: { id: true, assigneeId: true, delegateId: true },
  });
  if (!process) return { error: 'not_found' as const };
  if (isAdmin || process.assigneeId === userId || process.delegateId === userId) {
    return { process };
  }
  return { error: 'forbidden' as const };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(id, auth.userId, auth.session.user.isAdmin);
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

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
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, unit, targetValue, goalId, goals } = body;

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  // Validate goal timeLevel values if provided
  const validTimeLevels = Object.values(KpiTimeLevel) as string[];
  if (Array.isArray(goals) && goals.length > 0) {
    for (const g of goals) {
      if (!validTimeLevels.includes(g.timeLevel)) {
        return Response.json({ error: `Invalid timeLevel: ${g.timeLevel}` }, { status: 400 });
      }
      if (typeof g.targetValue !== 'number' || !isFinite(g.targetValue)) {
        return Response.json({ error: 'Goal targetValue must be a finite number' }, { status: 400 });
      }
    }
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
