import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackReadAccess } from '@/lib/auth-guard';
import { cacheHeaders, notFoundResponse } from '@/lib/api-helpers';
import { addDays, getLocalDateString, startOfToday } from '@/lib/date-utils';

/**
 * Daily activity counts for a Goal — count of Tasks linked to the goal whose
 * `completedAt` falls on each day. Used by the goal-detail heatmap.
 *
 * Query: `?days=N` (default 84 = 12 weeks; clamped 1..365).
 * Returns: `{ date: string; count: number }[]` from oldest → newest, inclusive
 * of every day in the range (zero-filled).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const daysParam = parseInt(searchParams.get('days') ?? '84', 10);
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 84, 1), 365);

  const goal = await prisma.goal.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      stack: { select: { id: true, isCompany: true, ownerId: true } },
    },
  });
  if (!goal || goal.deletedAt) return notFoundResponse('Goal');

  const accessDenied = await checkStackReadAccess(
    goal.stack,
    auth.userId,
    auth.session.user.isAdmin,
    { goalId: id }
  );
  if (accessDenied) return accessDenied;

  const today = startOfToday();
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const startDate = addDays(today, -(days - 1));

  const tasks = await prisma.task.findMany({
    where: {
      goalId: id,
      completedAt: { gte: startDate, lte: endOfToday },
    },
    select: { completedAt: true },
  });

  // Bucket by local-date key. Prisma returns UTC instants; getLocalDateString
  // collapses to the user's local calendar day.
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const key = getLocalDateString(t.completedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: { date: string; count: number }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= today) {
    const key = getLocalDateString(cursor);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return Response.json(result, { headers: cacheHeaders() });
}
