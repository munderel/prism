import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseLocalDate } from '@/lib/date-utils';

// Returns two lists for the Reports page "Work Blocks" tab:
// - powerdownReviews: aggregated per-day PowerdownWorkBlockReview rows
// - taskCompletions: TaskCompletionSnapshot rows with task title
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const dateFilter: Record<string, unknown> = {};
  if (from && to) {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    end.setDate(end.getDate() + 1);
    dateFilter.gte = start;
    dateFilter.lt = end;
  }

  const [powerdownReviews, taskCompletions] = await Promise.all([
    prisma.powerdownWorkBlockReview.findMany({
      where: {
        userId: auth.userId,
        ...(Object.keys(dateFilter).length > 0 ? { reviewDate: dateFilter } : {}),
      },
      orderBy: { reviewDate: 'desc' },
      take: 200,
    }),
    prisma.taskCompletionSnapshot.findMany({
      where: {
        userId: auth.userId,
        ...(Object.keys(dateFilter).length > 0 ? { completedAt: dateFilter } : {}),
      },
      orderBy: { completedAt: 'desc' },
      take: 200,
      include: {
        task: { select: { id: true, title: true, taskType: true } },
      },
    }),
  ]);

  return Response.json({ powerdownReviews, taskCompletions }, NO_STORE);
}
