import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeDerailInfo, type DerailInfo } from '@/lib/derail-detection';
import { buildDailyHistory, buildDateRange, computeExpectedPerDay } from '@/lib/aim-history';

/**
 * GET /api/aims/derail-batch?days=14
 *
 * Returns derail info + recent history for ALL active aims belonging to the
 * authenticated user. This replaces N individual calls to
 * /api/aims/history?aimCategoryId=X&days=14 that previously fired per-card.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get('days') || '14'), 90);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: { aimCategory: true },
  });

  if (userAims.length === 0) {
    return Response.json({});
  }

  const { startDate, endDate } = buildDateRange(days);
  const aimCategoryIds = userAims.map((ua) => ua.aimCategoryId);

  const allInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId: { in: aimCategoryIds },
      scheduledDate: { gte: startDate, lte: endDate },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // Group instances by aimCategoryId
  const instancesByCategory = new Map<string, typeof allInstances>();
  for (const inst of allInstances) {
    const list = instancesByCategory.get(inst.aimCategoryId) ?? [];
    list.push(inst);
    instancesByCategory.set(inst.aimCategoryId, list);
  }

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const result: Record<
    string,
    { derailInfo: DerailInfo; history: { date: string; completed: boolean; status: string }[]; expectedPerDay: number }
  > = {};

  for (const userAim of userAims) {
    const catId = userAim.aimCategoryId;
    const instances = instancesByCategory.get(catId) ?? [];

    const history = buildDailyHistory(instances, startDate, endDate);

    const recentInstances = instances.filter(
      (i) => new Date(i.scheduledDate) >= fourteenDaysAgo,
    );
    const derailInfo = computeDerailInfo(userAim, recentInstances, 14);
    const expectedPerDay = computeExpectedPerDay(userAim);

    result[catId] = { derailInfo, history, expectedPerDay };
  }

  return Response.json(result);
}
