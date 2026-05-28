import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackWriteAccess, checkStackReadAccess, isStackPrivileged, verifyStackMembership } from '@/lib/auth-guard';
import { cascadeKpiUpdate, recalculateMonthlyNumericKpi, recalculateBinaryKpi } from '@/lib/kpi-progress';
import { pickDefined, notFoundResponse, cacheHeaders } from '@/lib/api-helpers';
import { parseBody, updateKpiSchema } from '@/lib/schemas';

const KPI_PROGRESS_FIELDS = ['actualValue', 'isComplete'] as const;

const AIM_CONTRIBUTIONS_LIMIT = 5;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const kpi = await prisma.kpi.findUnique({
    where: { id },
    include: { goal: { include: { stack: true } } },
  });
  if (!kpi || kpi.goal.deletedAt !== null) return notFoundResponse('KPI');

  const accessDenied = await checkStackReadAccess(
    kpi.goal.stack,
    auth.userId,
    auth.session.user.isAdmin,
    { goalId: kpi.goalId },
  );
  if (accessDenied) return accessDenied;

  // Recent AIM contributions: AimInstance completions where the category is
  // linked to this KPI, most recent 5, for the authenticated user.
  const recentContributions = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      completedAt: { not: null },
      aimCategory: { linkedKpiId: id },
    },
    orderBy: { completedAt: 'desc' },
    take: AIM_CONTRIBUTIONS_LIMIT,
    select: {
      id: true,
      completedAt: true,
      aimCategory: {
        select: { name: true, kpiIncrement: true },
      },
    },
  });

  const contributions = recentContributions.map((inst) => ({
    instanceId: inst.id,
    completedAt: inst.completedAt,
    aimName: inst.aimCategory.name,
    increment: inst.aimCategory.kpiIncrement ?? 1,
  }));

  return Response.json({ kpi, aimContributions: contributions }, { headers: cacheHeaders() });
}

/**
 * Fetch a KPI and verify the caller may modify it.
 * - Admin or stack owner: full access.
 * - GoalAssignee on this KPI's goal: full access (rename, retarget, unit
 *   change, progress). Lets weekly-goal owners manage their KPIs without
 *   needing stack-owner permissions on the whole stack.
 * - The KPI owner (`kpi.ownerId === auth.userId`): may update progress fields only.
 * - CompanyGoalAssignment / other GoalAssignees: may update progress fields only.
 * - Others: 403.
 *
 * `intendedProgressOnly` is true when the body touches only actualValue / isComplete.
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

  // GoalAssignee on this KPI's goal gets full edit rights — they "own" the
  // goal in the user's mental model and so should manage its KPIs end-to-end.
  // This widens access beyond what checkStackWriteAccess(restricted: false)
  // would grant (admin / stack owner only).
  if (!intendedProgressOnly && !isStackPrivileged(stack, auth)) {
    const assignee = await prisma.goalAssignee.findUnique({
      where: { goalId_userId: { goalId: kpi.goalId, userId } },
      select: { id: true },
    });
    if (assignee) return { kpi } as const;
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

  // Cascade up the link chain (weekly → monthly → strategic → HHG). The
  // returned chain lets the client refresh every visible parent KPI in one
  // round-trip — otherwise the immediate parent's displayed value gets
  // refreshed but grandparents stay stale.
  const shouldCascade =
    kpi.linkedKpiId && (actualValue !== undefined || isComplete !== undefined);
  const cascadeChain = shouldCascade ? await cascadeKpiUpdate(id) : [];
  const fetchedCascade = cascadeChain.length > 0
    ? await prisma.kpi.findMany({
        where: { id: { in: cascadeChain } },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
        },
      })
    : [];
  const cascadeById = new Map(fetchedCascade.map((k) => [k.id, k]));
  const updatedLinkedKpis = cascadeChain
    .map((id) => cascadeById.get(id))
    .filter((k): k is (typeof fetchedCascade)[number] => !!k);

  return Response.json({
    kpi: updated,
    updatedLinkedKpi: updatedLinkedKpis[0] ?? null,
    updatedLinkedKpis,
  });
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

  // Recalculate the now-orphaned parent and chain the change upward so
  // grandparents (strategic, HHG) reflect the delete too. Collect the full
  // chain of affected parents (immediate parent + everything above) so the
  // client can refresh every level in one shot.
  type CascadedRow = Awaited<ReturnType<typeof prisma.kpi.findMany>>[number];
  const updatedLinkedKpis: CascadedRow[] = [];
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
      const ancestors = await cascadeKpiUpdate(kpi.linkedKpiId);
      const chain = [kpi.linkedKpiId, ...ancestors];
      const fetched = await prisma.kpi.findMany({
        where: { id: { in: chain } },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
        },
      });
      const byId = new Map(fetched.map((k) => [k.id, k]));
      for (const id of chain) {
        const row = byId.get(id);
        if (row) updatedLinkedKpis.push(row);
      }
    }
  }

  return Response.json({ ok: true, updatedLinkedKpis });
}
