import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find overdue reviews (scheduled before today, not completed)
  const now = new Date();

  const overdueReviews = await prisma.review.findMany({
    where: {
      scheduledDate: { lt: now },
      completedAt: null,
    },
    include: {
      user: { select: { id: true } },
    },
  });

  let notified = 0;

  for (const review of overdueReviews) {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: review.user.id },
    });

    if (!prefs || prefs.reviewNags) {
      await notifyUser(
        review.user.id,
        'Review Overdue',
        `Your ${review.reviewType} review (due ${new Date(review.scheduledDate).toLocaleDateString()}) is overdue. Complete it now.`,
        '/reviews'
      );
      notified++;
    }
  }

  return Response.json({ ok: true, overdue: overdueReviews.length, notified });
}
