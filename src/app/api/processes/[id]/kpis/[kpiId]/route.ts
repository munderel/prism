import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { authorizeProcessAccess, notFoundResponse, safeParseJson, pickDefined, validateKpiGoals } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { id: processId, kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(processId, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const kpiFields = pickDefined(body, ['name', 'unit', 'targetValue', 'goalId']);
  const { goals } = body;

  if (Array.isArray(goals) && goals.length > 0) {
    const goalsError = validateKpiGoals(goals, Object.values(KpiTimeLevel) as string[]);
    if (goalsError) return Response.json({ error: goalsError }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.processKpi.update({
      where: { id: kpiId },
      data: kpiFields,
    });

    if (Array.isArray(goals)) {
      await tx.processKpiGoal.deleteMany({ where: { kpiId } });
      if (goals.length > 0) {
        await tx.processKpiGoal.createMany({
          data: goals.map((g: { timeLevel: string; targetValue: number }) => ({
            kpiId,
            timeLevel: g.timeLevel as KpiTimeLevel,
            targetValue: g.targetValue,
          })),
        });
      }
    }

    return tx.processKpi.findUnique({
      where: { id: kpiId },
      include: {
        goals: true,
        goal: { select: { id: true, title: true } },
      },
    });
  });

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { id: processId, kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(processId, auth.userId, auth.session.user.isAdmin);
  if ('error' in access) return access.error;

  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  await prisma.processKpi.delete({ where: { id: kpiId } });

  return new Response(null, { status: 204 });
}
