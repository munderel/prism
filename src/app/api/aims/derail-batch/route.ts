import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeBufferDerailInfo, type BufferDerailInfo } from '@/lib/derailing-buffer';
import { buildDailyHistory, buildDateRange, computeExpectedPerDay } from '@/lib/aim-history';

/**
 * GET /api/aims/derail-batch?days=14
 *
 * Returns Beeminder-style buffer derail info + recent history for ALL
 * active aims belonging to the authenticated user.
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

  const instancesByCategory = new Map<string, typeof allInstances>();
  for (const inst of allInstances) {
    const list = instancesByCategory.get(inst.aimCategoryId) ?? [];
    list.push(inst);
    instancesByCategory.set(inst.aimCategoryId, list);
  }

  const result: Record<
    string,
    {
      derailInfo: BufferDerailInfo;
      history: { date: string; completed: boolean; status: string }[];
      expectedPerDay: number;
    }
  > = {};

  const now = new Date();
  for (const userAim of userAims) {
    const catId = userAim.aimCategoryId;
    const instances = instancesByCategory.get(catId) ?? [];
    const history = buildDailyHistory(instances, startDate, endDate);
    const derailInfo = computeBufferDerailInfo(
      userAim as unknown as Parameters<typeof computeBufferDerailInfo>[0],
      now,
    );
    const expectedPerDay = computeExpectedPerDay(userAim);
    result[catId] = { derailInfo, history, expectedPerDay };
  }

  return Response.json(result);
}
