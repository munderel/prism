import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeDerailInfo, type DerailInfo } from '@/lib/derail-detection';
import { getEffectiveFrequency } from '@/lib/aim-phases';

/**
 * GET /api/aims/history?aimCategoryId=X&days=30
 *
 * Returns daily history for a single aim category, plus the computed derail info.
 *
 * Response shape:
 * {
 *   history: [{ date: string, completed: boolean, status: string }],
 *   derailInfo: DerailInfo,
 *   expectedPerDay: number
 * }
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

  // Fetch the UserAim (with nested category) for frequency info
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

  // Build the date range
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // Fetch all instances in range
  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // Build a lookup of completed dates
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

  // Compute derail info using the last 14 days of data
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentInstances = instances.filter(
    (i) => new Date(i.scheduledDate) >= fourteenDaysAgo,
  );

  const derailInfo: DerailInfo = computeDerailInfo(userAim, recentInstances, 14);

  // Expected completions per day for chart annotation — phase-aware
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

  return Response.json({ history, derailInfo, expectedPerDay });
}
