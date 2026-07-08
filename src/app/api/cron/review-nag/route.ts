import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';
import { formatDateOnly } from '@/lib/date-utils';
import { NotificationType } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { reportError } from '@/lib/error-reporter';

const NAG_LOOKBACK_DAYS = 30;

const log = createLogger('cron/review-nag');

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
    // Dedup: don't re-nag a review nagged within the last ~day. Without this the
    // daily cron re-sent the same overdue-review alert every day for up to 30
    // days (the lookback only bounded how far back it looked, not re-sends).
    const nagCooldown = new Date(now.getTime() - 20 * 60 * 60 * 1000); // ~20h

    const overdueReviews = await prisma.review.findMany({
      where: {
        scheduledDate: { gte: nagFloor, lt: now },
        completedAt: null,
        OR: [{ lastNaggedAt: null }, { lastNaggedAt: { lt: nagCooldown } }],
      },
      include: {
        user: { select: { id: true } },
      },
    });

    const notifications = overdueReviews
      .map((review) =>
        notifyUser(
          review.user.id,
          'Review Overdue',
          `Your ${review.reviewType} review (due ${formatDateOnly(review.scheduledDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}) is overdue. Complete it now.`,
          '/reviews',
          NotificationType.REVIEW_NAG,
        )
      );

    // allSettled — one user's failed notify must not abort the whole nag run.
    await Promise.allSettled(notifications);

    // Mark the nagged reviews so they're not re-nagged before the cooldown.
    if (overdueReviews.length > 0) {
      await prisma.review.updateMany({
        where: { id: { in: overdueReviews.map((r) => r.id) } },
        data: { lastNaggedAt: now },
      });
    }

    const summary = { overdue: overdueReviews.length, notified: notifications.length };
    log.info('run complete', summary);
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    await reportError('cron/review-nag', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
