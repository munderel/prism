import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, putUserAimsSchema } from '@/lib/schemas';
import { KpiType } from '@prisma/client';

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
    select: { id: true },
  });
  const existingIds = new Set(existingCategories.map((c) => c.id));
  const missingId = categoryIds.find((id: string) => !existingIds.has(id));
  if (missingId) {
    return Response.json({ error: `AimCategory ${missingId} not found` }, { status: 404 });
  }

  // Validate KPI linkage before touching the DB.
  // linkedKpiId is only allowed on NUMERIC KPIs.
  for (const aim of aims as AimInput[]) {
    if (aim.linkedKpiId !== undefined && aim.linkedKpiId !== null) {
      const targetKpi = await prisma.kpi.findUnique({
        where: { id: aim.linkedKpiId },
        select: { id: true, type: true, _count: { select: { linkedFrom: true } } },
      });
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
    }
    if (aim.kpiIncrement !== undefined && aim.kpiIncrement !== null && aim.kpiIncrement <= 0) {
      return Response.json({ error: 'kpiIncrement must be > 0' }, { status: 400 });
    }
  }

  // Collect aims that include KPI linkage changes (applied to AimCategory below).
  const kpiLinkageAims = (aims as AimInput[]).filter(
    (a) => a.linkedKpiId !== undefined || a.kpiIncrement !== undefined,
  );

  // Validate that the requesting user owns the category (only user-created habits
  // with createdByUserId === auth.userId may be modified by this user; default
  // categories are shared and must not be mutated by individual users).
  for (const aim of kpiLinkageAims) {
    const category = existingCategories.find((c) => c.id === aim.aimCategoryId);
    if (!category) continue; // already verified above
    const fullCat = await prisma.aimCategory.findUnique({
      where: { id: aim.aimCategoryId },
      select: { createdByUserId: true, isDefault: true, linkedKpiId: true, kpiIncrement: true },
    });
    if (!fullCat) continue;
    // Only a genuine change to the shared category's KPI linkage requires
    // ownership. A no-op resend (e.g. saving active-days on a shared default
    // AIM) must not be rejected — that silently dropped per-user edits.
    const linkedChanged =
      aim.linkedKpiId !== undefined && (aim.linkedKpiId ?? null) !== (fullCat.linkedKpiId ?? null);
    const incrementChanged =
      aim.kpiIncrement !== undefined && (aim.kpiIncrement ?? null) !== (fullCat.kpiIncrement ?? null);
    if (!linkedChanged && !incrementChanged) continue;
    if (fullCat.isDefault && fullCat.createdByUserId !== auth.userId && !auth.session.user.isAdmin) {
      return Response.json(
        { error: 'Cannot modify KPI linkage on a shared default AIM category' },
        { status: 403 },
      );
    }
  }

  const results = await prisma.$transaction(
    aims.map((aim: AimInput) =>
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
      })
    )
  );

  // Per-aim SEED skip: for any aim the caller just flagged skipSeedPhase=true
  // that's still sitting in SEED, advance it to SPROUT now. Scoped to SEED so a
  // GROW/FLOW aim is never knocked backwards.
  const skipSeedCategoryIds = (aims as AimInput[])
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

  // Apply KPI linkage changes to AimCategory (outside the upsert transaction —
  // these are structural edits to the shared category row, not per-user data).
  if (kpiLinkageAims.length > 0) {
    await Promise.all(
      kpiLinkageAims.map((aim) => {
        const updateData: { linkedKpiId?: string | null; kpiIncrement?: number | null } = {};
        if (aim.linkedKpiId !== undefined) updateData.linkedKpiId = aim.linkedKpiId;
        if (aim.kpiIncrement !== undefined) updateData.kpiIncrement = aim.kpiIncrement;
        return prisma.aimCategory.update({
          where: { id: aim.aimCategoryId },
          data: updateData,
        });
      }),
    );
  }

  return Response.json(results);
}
