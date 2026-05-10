import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackWriteAccess, verifyStackMembership } from '@/lib/auth-guard';
import { cascadeKpiUpdate, recalculateMonthlyNumericKpi, recalculateBinaryKpi } from '@/lib/kpi-progress';
import { pickDefined, notFoundResponse } from '@/lib/api-helpers';
import { parseBody, updateKpiSchema } from '@/lib/schemas';

const KPI_PROGRESS_FIELDS = ['actualValue', 'isComplete'] as const;

/**
 * Fetch a KPI and verify the caller may modify it.
 * - Admin or stack owner: full access.
 * - The KPI owner (`kpi.ownerId === auth.userId`): may update progress fields only.
 * - Goal/stack assignees: may update progress fields only (via `checkStackWriteAccess` restricted mode).
 * - Others: 403.
 *
 * `intendedProgressOnly` tells callers whether the intended mutation is progress-only;
 * we use this to decide whether assignee/KPI-owner access is sufficient.
 */
async function loadAndAuthorizeKpi(
  id: string,
  auth: { userId: string; session: { user: { isAdmin: boolean } } },
  intendedProgressOnly: boolean,
) {
  const kpi = await prisma.kpi.findUnique({
    where: { id },
    include: { goal: { include: { stack: true } } },
  });

  if (!kpi) return { error: notFoundResponse('KPI') } as const;
  if (kpi.goal.deletedAt !== null) return { error: notFoundResponse('KPI') } as const;

  const { stack } = kpi.goal;
  const { userId, session } = auth;

  // Owner of the KPI may log progress on their own KPI.
  if (intendedProgressOnly && kpi.ownerId === userId) {
    return { kpi } as const;
  }

  const denied = await checkStackWriteAccess(stack, userId, session.user.isAdmin, {
    goalId: kpi.goalId,
    restricted: intendedProgressOnly,
  });
  if (denied) return { error: denied } as const;

  return { kpi } as const;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, updateKpiSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { name, isComplete, actualValue, ownerId } = body;

  const intendedFields = Object.keys(body).filter(
    (k) => body[k as keyof typeof body] !== undefined,
  );
  const intendedProgressOnly =
    intendedFields.length > 0 && intendedFields.every((f) => (KPI_PROGRESS_FIELDS as readonly string[]).includes(f));

  const result = await loadAndAuthorizeKpi(id, auth, intendedProgressOnly);
  if ('error' in result) return result.error;
  const { kpi } = result;

  const data: Record<string, unknown> = pickDefined(body, ['name', 'unit', 'targetValue', 'actualValue', 'sortOrder']);
  if (isComplete !== undefined) {
    data.isComplete = isComplete;
    data.completedAt = isComplete ? new Date() : null;
  }
  if (ownerId !== undefined) {
    if (ownerId === null) {
      data.ownerId = null;
    } else {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });
      if (!owner) {
        return Response.json({ error: 'Owner user not found' }, { status: 400 });
      }
      const isMember = await verifyStackMembership(kpi.goal.stack, ownerId, kpi.goalId);
      if (!isMember) {
        return Response.json(
          { error: 'Owner is not a member of this stack or goal' },
          { status: 400 },
        );
      }
      data.ownerId = ownerId;
    }
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

  const updated = await prisma.kpi.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
    },
  });

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

  // Deleting a KPI is structural — never allow progress-only fallback.
  const result = await loadAndAuthorizeKpi(id, auth, false);
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
