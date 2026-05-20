import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const aimCategoryId = searchParams.get('aimCategoryId');
  const daysParam = searchParams.get('days');
  const weeksParam = searchParams.get('weeks');

  if (!aimCategoryId) {
    return Response.json(
      { error: 'aimCategoryId query param is required' },
      { status: 400 }
    );
  }

  // Support ?weeks=N as an alias for ?days=(N*7). weeks takes precedence.
  let days: number;
  if (weeksParam !== null) {
    const weeks = Math.min(Math.max(parseInt(weeksParam, 10) || 8, 1), 52);
    days = weeks * 7;
  } else {
    days = Math.min(Math.max(parseInt(daysParam || '56', 10) || 56, 1), 365);
  }

  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: { gte: startDate, lte: endDate },
    },
    select: {
      scheduledDate: true,
      status: true,
      completedAt: true,
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // Build a map of date -> best completion state (any completed instance marks the day)
  const instanceMap = new Map<string, { scheduled: boolean; completed: boolean }>();
  for (const inst of instances) {
    const dateKey = inst.scheduledDate.toISOString().slice(0, 10);
    const completed = inst.status === 'COMPLETED' || inst.completedAt !== null;
    const existing = instanceMap.get(dateKey);
    instanceMap.set(dateKey, {
      scheduled: true,
      completed: existing ? existing.completed || completed : completed,
    });
  }

  // Fill in every day in the range
  const result: { date: string; scheduled: boolean; completed: boolean }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const entry = instanceMap.get(dateKey);
    result.push({
      date: dateKey,
      scheduled: entry?.scheduled ?? false,
      completed: entry?.completed ?? false,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return Response.json(result, { headers: cacheHeaders() });
}
