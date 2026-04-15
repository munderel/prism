import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { notifyUser } from '@/lib/notifications';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

/** Map review type to a human-readable task title. */
function reviewTaskTitle(reviewType: string): string {
  switch (reviewType) {
    case 'WEEKLY':  return 'Complete Weekly Review';
    case 'MONTHLY': return 'Complete Monthly Review';
    case 'YEARLY':  return 'Complete Yearly Review';
    default:        return `Complete ${reviewType} Review`;
  }
}

/** Return the period boundaries for dedup: only one REVIEW task per period. */
function periodRange(reviewType: string, anchor: Date): { start: Date; end: Date } {
  switch (reviewType) {
    case 'MONTHLY':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'YEARLY':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
    case 'WEEKLY':
    default:
      return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
  }
}

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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

    // Batch-fetch notification preferences for all review owners
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

    // --- Auto-create REVIEW tasks for each overdue review (idempotent) ---
    let tasksCreated = 0;

    for (const review of overdueReviews) {
      const title = reviewTaskTitle(review.reviewType);
      const dueDate = new Date(review.scheduledDate);
      const { start, end } = periodRange(review.reviewType, dueDate);

      // Check if a REVIEW task already exists for this user in the same period
      const existing = await prisma.task.findFirst({
        where: {
          ownerId: review.user.id,
          taskType: 'REVIEW',
          title,
          dueDate: { gte: start, lte: end },
        },
      });

      if (!existing) {
        await prisma.task.create({
          data: {
            ownerId: review.user.id,
            taskType: 'REVIEW',
            title,
            status: 'TODO',
            priority: 'HIGH',
            dueDate,
          },
        });
        tasksCreated++;
      }
    }

    return Response.json({
      ok: true,
      overdue: overdueReviews.length,
      notified: notifications.length,
      tasksCreated,
    });
  } catch (error) {
    console.error('[cron/review-nag] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
