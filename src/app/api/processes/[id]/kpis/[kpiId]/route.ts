import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, safeParseJson, pickDefined } from '@/lib/api-helpers';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kpiId: string }> }
) {
  const { id: processId, kpiId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const access = await authorizeProcessAccess(processId, auth.userId, auth.session.user.isAdmin);
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const kpiFields = pickDefined(body, ['name', 'unit', 'targetValue', 'goalId']);

  const { goals } = body;

  // Validate goal timeLevel values if provided
  if (Array.isArray(goals) && goals.length > 0) {
    const validTimeLevels = Object.values(KpiTimeLevel) as string[];
    for (const g of goals) {
      if (!validTimeLevels.includes(g.timeLevel)) {
        return Response.json({ error: `Invalid timeLevel: ${g.timeLevel}` }, { status: 400 });
      }
      if (typeof g.targetValue !== 'number' || !isFinite(g.targetValue)) {
        return Response.json({ error: 'Goal targetValue must be a finite number' }, { status: 400 });
      }
    }
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
  if (access.error === 'not_found') return notFoundResponse('Process');
  if (access.error === 'forbidden') return forbiddenResponse();

  const kpi = await prisma.processKpi.findUnique({ where: { id: kpiId } });
  if (!kpi || kpi.processId !== processId) return notFoundResponse('KPI');

  await prisma.processKpi.delete({ where: { id: kpiId } });

  return new Response(null, { status: 204 });
}
