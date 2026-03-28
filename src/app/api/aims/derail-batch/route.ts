import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeDerailInfo, type DerailInfo } from '@/lib/derail-detection';
import { getEffectiveFrequency } from '@/lib/aim-phases';

/**
 * GET /api/aims/derail-batch?days=14
 *
 * Returns derail info + recent history for ALL active aims belonging to the
 * authenticated user.  This replaces the N individual calls to
 * /api/aims/history?aimCategoryId=X&days=14 that previously fired per-card.
 *
 * Response shape:
 * {
 *   [aimCategoryId: string]: {
 *     derailInfo: DerailInfo,
 *     history: { date: string, completed: boolean, status: string }[],
 *     expectedPerDay: number
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get('days') || '14'), 90);

  // 1. Fetch all active UserAims for this user (with nested category)
  const userAims = await prisma.userAim.findMany({
    where: {
      userId: auth.userId,
      isActive: true,
    },
    include: { aimCategory: true },
  });

  if (userAims.length === 0) {
    return Response.json({});
  }

  // 2. Build the date range
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // 3. Fetch ALL instances for these aims in one query
  const aimCategoryIds = userAims.map((ua) => ua.aimCategoryId);
  const allInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId: { in: aimCategoryIds },
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // 4. Group instances by aimCategoryId
  const instancesByCategory = new Map<string, typeof allInstances>();
  for (const inst of allInstances) {
    const list = instancesByCategory.get(inst.aimCategoryId) ?? [];
    list.push(inst);
    instancesByCategory.set(inst.aimCategoryId, list);
  }

  // 5. For each active aim, compute history + derailInfo
  const result: Record<
    string,
    {
      derailInfo: DerailInfo;
      history: { date: string; completed: boolean; status: string }[];
      expectedPerDay: number;
    }
  > = {};

  for (const userAim of userAims) {
    const catId = userAim.aimCategoryId;
    const instances = instancesByCategory.get(catId) ?? [];

    // Build completed-dates lookup
    const completedDates = new Set<string>();
    const instancesByDate = new Map<string, { status: string }>();
    for (const inst of instances) {
      const dateKey = new Date(inst.scheduledDate).toISOString().split('T')[0];
      instancesByDate.set(dateKey, { status: inst.status });
      if (inst.status === 'COMPLETED' || inst.completedAt) {
        completedDates.add(dateKey);
      }
    }

    // Generate day-by-day history
    const history: { date: string; completed: boolean; status: string }[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dateKey = cursor.toISOString().split('T')[0];
      const inst = instancesByDate.get(dateKey);
      history.push({
        date: dateKey,
        completed: completedDates.has(dateKey),
        status: inst?.status ?? 'NONE',
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Compute derail info (always over 14-day window)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentInstances = instances.filter(
      (i) => new Date(i.scheduledDate) >= fourteenDaysAgo,
    );
    const derailInfo = computeDerailInfo(userAim, recentInstances, 14);

    // Expected completions per day — phase-aware
    const effectiveFreq = getEffectiveFrequency({
      customDuration: userAim.customDuration,
      customFrequency: userAim.customFrequency,
      currentPhase: userAim.currentPhase,
      phaseStartedAt: userAim.phaseStartedAt,
      aimCategory: {
        defaultDurationMin: userAim.aimCategory.defaultDurationMin,
        defaultFrequency: userAim.aimCategory.defaultFrequency,
      },
    });
    const expectedPerDay = userAim.aimCategory.isDaily ? 1 : effectiveFreq / 7;

    result[catId] = { derailInfo, history, expectedPerDay };
  }

  return Response.json(result);
}
