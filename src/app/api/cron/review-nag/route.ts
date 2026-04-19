import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Clean up stale REVIEW tasks created by previous versions of this cron.
    // The dashboard and tasks page now surface overdue reviews directly from
    // the Review model via a banner; surrogate REVIEW tasks are redundant and
    // were leaking into the unscheduled-task lists.
    const cleanupRes = await prisma.task.deleteMany({
      where: { taskType: 'REVIEW' },
    });

    const overdueReviews = await prisma.review.findMany({
      where: {
        scheduledDate: { lt: now },
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
          `Your ${review.reviewType} review (due ${new Date(review.scheduledDate).toLocaleDateString()}) is overdue. Complete it now.`,
          '/reviews'
        )
      );

    await Promise.all(notifications);

    return Response.json({
      ok: true,
      overdue: overdueReviews.length,
      notified: notifications.length,
      staleTasksRemoved: cleanupRes.count,
    });
  } catch (error) {
    console.error('[cron/review-nag] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
