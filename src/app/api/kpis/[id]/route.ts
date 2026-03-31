import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cascadeKpiUpdate, recalculateMonthlyNumericKpi, recalculateBinaryKpi } from '@/lib/kpi-progress';
import { pickDefined, notFoundResponse, forbiddenResponse, safeParseJson } from '@/lib/api-helpers';

/** Fetch a KPI and verify the caller has permission to modify it. */
async function loadAndAuthorizeKpi(id: string, auth: { userId: string; session: { user: { isAdmin: boolean } } }) {
  const kpi = await prisma.kpi.findUnique({
    where: { id },
    include: { goal: { include: { stack: true } } },
  });

  if (!kpi) return { error: notFoundResponse('KPI') } as const;

  const { stack } = kpi.goal;
  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return { error: forbiddenResponse() } as const;
  }

  return { kpi } as const;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const result = await loadAndAuthorizeKpi(id, auth);
  if ('error' in result) return result.error;
  const { kpi } = result;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, isComplete, actualValue } = body;

  const data: Record<string, unknown> = pickDefined(body, ['name', 'unit', 'targetValue', 'actualValue', 'sortOrder']);
  if (isComplete !== undefined) {
    data.isComplete = isComplete;
    data.completedAt = isComplete ? new Date() : null;
  }

  // Check unique constraint if name is changing
  if (name !== undefined && name !== kpi.name) {
    const existing = await prisma.kpi.findUnique({
      where: { goalId_name: { goalId: kpi.goalId, name } },
    });
    if (existing) {
      return Response.json(
        { error: `A KPI named "${name}" already exists on this goal` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.kpi.update({ where: { id }, data });

  // Cascade to linked monthly KPI if applicable
  let updatedLinkedKpi = null;
  if (kpi.linkedKpiId && (actualValue !== undefined || isComplete !== undefined)) {
    await cascadeKpiUpdate(id);
    updatedLinkedKpi = await prisma.kpi.findUnique({ where: { id: kpi.linkedKpiId } });
  }

  return Response.json({ kpi: updated, updatedLinkedKpi });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const result = await loadAndAuthorizeKpi(id, auth);
  if ('error' in result) return result.error;
  const { kpi } = result;

  // Unlink any KPIs that point to this one (avoid FK constraint)
  await prisma.kpi.updateMany({
    where: { linkedKpiId: id },
    data: { linkedKpiId: null },
  });

  await prisma.kpi.delete({ where: { id } });

  // Recalculate former linked monthly KPI if there was a link
  if (kpi.linkedKpiId) {
    const linkedKpi = await prisma.kpi.findUnique({
      where: { id: kpi.linkedKpiId },
      select: { type: true },
    });
    if (linkedKpi) {
      if (linkedKpi.type === 'NUMERIC') {
        await recalculateMonthlyNumericKpi(kpi.linkedKpiId);
      } else {
        await recalculateBinaryKpi(kpi.linkedKpiId, false);
      }
    }
  }

  return Response.json({ ok: true });
}
