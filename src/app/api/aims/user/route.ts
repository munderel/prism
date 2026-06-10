import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackReadAccess } from '@/lib/auth-guard';
import { parseBody, putUserAimsSchema } from '@/lib/schemas';
import { KpiType, type Prisma } from '@prisma/client';

type KpiWithGoalStack = Prisma.KpiGetPayload<{
  include: {
    goal: { include: { stack: true } };
    _count: { select: { linkedFrom: true } };
  };
}>;

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId },
    include: { aimCategory: true },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(userAims);
}

interface AimInput {
  aimCategoryId: string;
  isActive?: boolean;
  customDuration?: number | null;
  customFrequency?: number | null;
  customActivities?: string[];
  currentPhase?: string;
  phaseStartedAt?: string;
  completionCount?: number;
  currentStreak?: number;
  activeWeekdays?: number;
  skipSeedPhase?: boolean;
  // KPI linkage — stored on AimCategory, not UserAim
  linkedKpiId?: string | null;
  kpiIncrement?: number | null;
}

/** Build the shared data payload for both create and update in a upsert. */
function buildAimData(aim: AimInput, userId?: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    isActive: aim.isActive ?? true,
    customDuration: aim.customDuration ?? null,
    customFrequency: aim.customFrequency ?? null,
    customActivities: aim.customActivities ?? undefined,
  };

  if (userId) {
    data.userId = userId;
    data.aimCategoryId = aim.aimCategoryId;
  }

  // Phase reset fields -- only include when explicitly provided
  if (aim.currentPhase !== undefined) data.currentPhase = aim.currentPhase;
  if (aim.phaseStartedAt !== undefined) data.phaseStartedAt = new Date(aim.phaseStartedAt);
  if (aim.completionCount !== undefined) data.completionCount = aim.completionCount;
  if (aim.currentStreak !== undefined) data.currentStreak = aim.currentStreak;

  // activeWeekdays bitmask (0–127); only update when explicitly provided.
  if (aim.activeWeekdays !== undefined) data.activeWeekdays = aim.activeWeekdays;

  // Per-aim SEED skip. When creating an aim with the flag set and no explicit
  // phase, start it at SPROUT so it never sits in the SEED ramp-up. (Existing
  // SEED aims are bumped to SPROUT post-upsert below to avoid knocking a
  // GROW/FLOW aim backwards.)
  if (aim.skipSeedPhase !== undefined) data.skipSeedPhase = aim.skipSeedPhase;
  if (userId && aim.skipSeedPhase === true && aim.currentPhase === undefined) {
    data.currentPhase = 'SPROUT';
  }

  return data;
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, putUserAimsSchema);
  if ('error' in parsed) return parsed.error;
  const { aims } = parsed.data;

  // Validate all categories exist upfront in a single query
  const categoryIds = aims.map((a: AimInput) => a.aimCategoryId).filter(Boolean);
  if (categoryIds.length !== aims.length) {
    return Response.json({ error: 'Each aim must have aimCategoryId' }, { status: 400 });
  }

  const existingCategories = await prisma.aimCategory.findMany({
    where: { id: { in: categoryIds } },
    select: {
      id: true,
      createdByUserId: true,
      isDefault: true,
      linkedKpiId: true,
      kpiIncrement: true,
    },
  });
  const categoryById = new Map(existingCategories.map((c) => [c.id, c]));
  const missingId = categoryIds.find((id: string) => !categoryById.has(id));
  if (missingId) {
    return Response.json({ error: `AimCategory ${missingId} not found` }, { status: 404 });
  }

  const aimList = aims as AimInput[];

  // Aims that touch KPI linkage on the (shared) AimCategory row. Those rows are
  // not per-user data and need a stricter ownership check than the per-user
  // UserAim upsert below.
  const kpiLinkageAims = aimList.filter(
    (a) => a.linkedKpiId !== undefined || a.kpiIncrement !== undefined,
  );

  // Only a genuine change to the category's KPI linkage requires ownership.
  // A no-op resend (e.g. saving active-days on a shared default AIM) must not
  // be rejected — that silently dropped per-user edits.
  const changedLinkageAims = kpiLinkageAims.filter((aim) => {
    const cat = categoryById.get(aim.aimCategoryId);
    if (!cat) return false;
    const linkedChanged =
      aim.linkedKpiId !== undefined && (aim.linkedKpiId ?? null) !== (cat.linkedKpiId ?? null);
    const incrementChanged =
      aim.kpiIncrement !== undefined && (aim.kpiIncrement ?? null) !== (cat.kpiIncrement ?? null);
    return linkedChanged || incrementChanged;
  });

  // Ownership: only the creator (or an admin for shared defaults) may mutate
  // a category. Without this, any signed-in user could rewrite another user's
  // habit by guessing its id.
  for (const aim of changedLinkageAims) {
    const cat = categoryById.get(aim.aimCategoryId);
    if (!cat) continue;
    const isCreator = cat.createdByUserId === auth.userId;
    const isSharedDefault = cat.isDefault && cat.createdByUserId === null;
    const allowed =
      isCreator || (isSharedDefault && auth.session.user.isAdmin);
    if (!allowed) {
      return Response.json(
        { error: 'Not allowed to modify this AIM category' },
        { status: 403 },
      );
    }
  }

  // Batch-validate KPI linkages: one round-trip for type, leaf status, and
  // stack-read access.
  const linkedKpiIds = Array.from(
    new Set(
      kpiLinkageAims
        .map((a) => a.linkedKpiId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  const kpiById = new Map<string, KpiWithGoalStack>();
  if (linkedKpiIds.length) {
    const rows = await prisma.kpi.findMany({
      where: { id: { in: linkedKpiIds } },
      include: {
        goal: { include: { stack: true } },
        _count: { select: { linkedFrom: true } },
      },
    });
    for (const k of rows) kpiById.set(k.id, k);
  }

  for (const aim of aimList) {
    if (aim.linkedKpiId) {
      const targetKpi = kpiById.get(aim.linkedKpiId);
      if (!targetKpi) {
        return Response.json({ error: 'Linked KPI not found' }, { status: 400 });
      }
      if (targetKpi.type !== KpiType.NUMERIC) {
        return Response.json({ error: 'Cannot link AIM to a BINARY KPI' }, { status: 400 });
      }
      // Forbid the dual-role config: a KPI that is BOTH a rollup parent (has
      // linked weekly children) AND AIM-linked has two conflicting writers of
      // actualValue — the monthly rollup overwrites the AIM's direct increments
      // with SUM(children), silently losing the AIM contribution. Only leaf KPIs
      // (no children) may be AIM-linked.
      if (targetKpi._count.linkedFrom > 0) {
        return Response.json(
          { error: 'Cannot link an AIM to a KPI that rolls up weekly children. Link the AIM to a leaf (weekly) KPI instead.' },
          { status: 400 },
        );
      }
      const denied = await checkStackReadAccess(
        targetKpi.goal.stack,
        auth.userId,
        auth.session.user.isAdmin,
        { goalId: targetKpi.goalId },
      );
      if (denied) {
        return Response.json(
          { error: 'Not allowed to link to this KPI' },
          { status: 403 },
        );
      }
    }
    if (aim.kpiIncrement !== undefined && aim.kpiIncrement !== null && aim.kpiIncrement <= 0) {
      return Response.json({ error: 'kpiIncrement must be > 0' }, { status: 400 });
    }
  }

  // Persist UserAim upserts and AimCategory linkage updates atomically, so a
  // partial failure can't leave UserAim and AimCategory inconsistent. Category
  // writes are limited to genuine changes — a no-op resend never touches the
  // shared row.
  const categoryUpdates = changedLinkageAims.map((aim) => {
    const updateData: { linkedKpiId?: string | null; kpiIncrement?: number | null } = {};
    if (aim.linkedKpiId !== undefined) updateData.linkedKpiId = aim.linkedKpiId;
    if (aim.kpiIncrement !== undefined) updateData.kpiIncrement = aim.kpiIncrement;
    return prisma.aimCategory.update({
      where: { id: aim.aimCategoryId },
      data: updateData,
    });
  });

  const txResult = await prisma.$transaction([
    ...aimList.map((aim) =>
      prisma.userAim.upsert({
        where: {
          userId_aimCategoryId: {
            userId: auth.userId,
            aimCategoryId: aim.aimCategoryId,
          },
        },
        update: buildAimData(aim),
        create: buildAimData(aim, auth.userId) as any,
        include: { aimCategory: true },
      }),
    ),
    ...categoryUpdates,
  ]);

  // Per-aim SEED skip: for any aim the caller just flagged skipSeedPhase=true
  // that's still sitting in SEED, advance it to SPROUT now. Scoped to SEED so a
  // GROW/FLOW aim is never knocked backwards.
  const skipSeedCategoryIds = aimList
    .filter((a) => a.skipSeedPhase === true && a.currentPhase === undefined)
    .map((a) => a.aimCategoryId);
  if (skipSeedCategoryIds.length > 0) {
    await prisma.userAim.updateMany({
      where: {
        userId: auth.userId,
        aimCategoryId: { in: skipSeedCategoryIds },
        currentPhase: 'SEED',
      },
      data: { currentPhase: 'SPROUT', phaseStartedAt: new Date() },
    });
  }

  const results = txResult.slice(0, aimList.length);
  return Response.json(results);
}
