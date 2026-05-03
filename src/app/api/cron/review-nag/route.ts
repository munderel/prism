import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';
import { formatDateOnly } from '@/lib/date-utils';

const NAG_LOOKBACK_DAYS = 30;

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    // Only nag about reviews missed in the last N days. Without a lower bound
    // we'd re-notify users about reviews skipped a year ago on every run.
    const nagFloor = new Date(now);
    nagFloor.setDate(nagFloor.getDate() - NAG_LOOKBACK_DAYS);

    const overdueReviews = await prisma.review.findMany({
      where: {
        scheduledDate: { gte: nagFloor, lt: now },
        completedAt: null,
      },
      include: {
        user: { select: { id: true } },
      },
    });

    const ownerIds = Array.from(new Set(overdueReviews.map((r) => r.user.id)));
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: ownerIds } },
    });
    const prefsMap = new Map(prefs.map((p) => [p.userId, p]));

    const notifications = overdueReviews
      .filter((review) => {
        const pref = prefsMap.get(review.user.id);
        return !pref || pref.reviewNags;
      })
      .map((review) =>
        notifyUser(
          review.user.id,
          'Review Overdue',
          `Your ${review.reviewType} review (due ${formatDateOnly(review.scheduledDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}) is overdue. Complete it now.`,
          '/reviews'
        )
      );

    await Promise.all(notifications);

    return Response.json({
      ok: true,
      overdue: overdueReviews.length,
      notified: notifications.length,
    });
  } catch (error) {
    console.error('[cron/review-nag] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
