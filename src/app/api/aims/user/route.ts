import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackReadAccess } from '@/lib/auth-guard';
import { parseBody, putUserAimsSchema } from '@/lib/schemas';
import { KpiType, type Prisma } from '@prisma/client';

type KpiWithGoalStack = Prisma.KpiGetPayload<{
  include: { goal: { include: { stack: true } } };
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
    select: { id: true, createdByUserId: true, isDefault: true },
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

  // Ownership: only the creator (or an admin for shared defaults) may mutate
  // a category. Without this, any signed-in user could rewrite another user's
  // habit by guessing its id.
  for (const aim of kpiLinkageAims) {
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

  // Batch-validate KPI linkages: one round-trip for type + stack-read access.
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
      include: { goal: { include: { stack: true } } },
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
  // partial failure can't leave UserAim and AimCategory inconsistent.
  const categoryUpdates = kpiLinkageAims.map((aim) => {
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

  const results = txResult.slice(0, aimList.length);
  return Response.json(results);
}
