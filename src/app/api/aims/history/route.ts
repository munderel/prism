import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeDerailInfo, type DerailInfo } from '@/lib/derailing';
import { buildDailyHistory, buildDateRange, computeExpectedPerDay } from '@/lib/aim-history';

/**
 * GET /api/aims/history?aimCategoryId=X&days=30
 *
 * Returns daily history for a single aim category, plus the computed derail info.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const aimCategoryId = searchParams.get('aimCategoryId');
  const days = Math.min(Number(searchParams.get('days') || '30'), 90);

  if (!aimCategoryId) {
    return Response.json({ error: 'aimCategoryId is required' }, { status: 400 });
  }

  const userAim = await prisma.userAim.findUnique({
    where: {
      userId_aimCategoryId: {
        userId: auth.userId,
        aimCategoryId,
      },
    },
    include: { aimCategory: true },
  });

  if (!userAim) {
    return Response.json({ error: 'UserAim not found' }, { status: 404 });
  }

  const { startDate, endDate } = buildDateRange(days);

  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: { gte: startDate, lte: endDate },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  const history = buildDailyHistory(instances, startDate, endDate);

  // Compute derail info using the last 14 days of data
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentInstances = instances.filter(
    (i) => new Date(i.scheduledDate) >= fourteenDaysAgo,
  );
  const derailInfo: DerailInfo = computeDerailInfo(userAim, recentInstances, 14);

  const expectedPerDay = computeExpectedPerDay(userAim);

  return Response.json({ history, derailInfo, expectedPerDay });
}
