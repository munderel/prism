import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { authorizeProcessAccess } from '@/lib/api-helpers';
import { parseBody, createProcessKpiSchema } from '@/lib/schemas';

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

  const parsed = await parseBody(request, createProcessKpiSchema);
  if ('error' in parsed) return parsed.error;
  const { name, unit, targetValue, goalId, goals } = parsed.data;

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
