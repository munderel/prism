import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cascadeKpiUpdate, recalculateMonthlyNumericKpi, recalculateBinaryKpi } from '@/lib/kpi-progress';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const kpi = await prisma.kpi.findUnique({
    where: { id },
    include: { goal: { include: { stack: true } } },
  });

  if (!kpi) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const stack = kpi.goal.stack;
  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { name, unit, targetValue, actualValue, isComplete, sortOrder } = body;

  const data: Record<string, any> = {};
  if (name !== undefined) data.name = name;
  if (unit !== undefined) data.unit = unit;
  if (targetValue !== undefined) data.targetValue = targetValue;
  if (actualValue !== undefined) data.actualValue = actualValue;
  if (isComplete !== undefined) {
    data.isComplete = isComplete;
    data.completedAt = isComplete ? new Date() : null;
  }
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

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

  const kpi = await prisma.kpi.findUnique({
    where: { id },
    include: { goal: { include: { stack: true } } },
  });

  if (!kpi) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const stack = kpi.goal.stack;
  if (!stack.isCompany && stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const linkedKpiId = kpi.linkedKpiId;

  await prisma.kpi.delete({ where: { id } });

  // Recalculate former linked monthly KPI if there was a link
  if (linkedKpiId) {
    const linkedKpi = await prisma.kpi.findUnique({
      where: { id: linkedKpiId },
      select: { type: true },
    });
    if (linkedKpi) {
      if (linkedKpi.type === 'NUMERIC') {
        await recalculateMonthlyNumericKpi(linkedKpiId);
      } else {
        await recalculateBinaryKpi(linkedKpiId, false);
      }
    }
  }

  return Response.json({ ok: true });
}
