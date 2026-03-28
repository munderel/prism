import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const aimCategoryId = searchParams.get('aimCategoryId');
  const daysParam = searchParams.get('days');

  if (!aimCategoryId) {
    return Response.json(
      { error: 'aimCategoryId query param is required' },
      { status: 400 }
    );
  }

  const days = Math.min(Math.max(parseInt(daysParam || '56', 10) || 56, 1), 120);

  // Calculate date range: last N days ending today
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  // Fetch all AimInstance records for this user + category in the date range
  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      scheduledDate: true,
      status: true,
      completedAt: true,
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // Build a map of date -> instance data
  const instanceMap = new Map<string, { scheduled: boolean; completed: boolean }>();
  for (const inst of instances) {
    const dateKey = inst.scheduledDate.toISOString().slice(0, 10);
    const existing = instanceMap.get(dateKey);
    const completed = inst.status === 'COMPLETED' || inst.completedAt !== null;
    if (existing) {
      // If any instance on this date is completed, mark as completed
      instanceMap.set(dateKey, {
        scheduled: true,
        completed: existing.completed || completed,
      });
    } else {
      instanceMap.set(dateKey, {
        scheduled: true,
        completed,
      });
    }
  }

  // Build the result array for each day in the range
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

  return Response.json(result);
}
