import { NextRequest } from 'next/server';
import { ReviewType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateReviewSchema } from '@/lib/schemas';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { cancelManagedSeriesInstance, syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { updateSpecificStreak } from '@/lib/streak-engine';
import { ProcessCadence } from '@prisma/client';

// Maps review cadence to a continuation window for the review-specific streak.
// Without this mapping, a weekly review completion would be treated as a daily
// streak (1-day window) and reset every week instead of continuing.
const REVIEW_TYPE_TO_CADENCE: Record<ReviewType, ProcessCadence> = {
  WEEKLY: ProcessCadence.WEEKLY,
  MONTHLY: ProcessCadence.MONTHLY,
  YEARLY: ProcessCadence.YEARLY,
};

// Sibling rows can exist when a review's scheduledDate was stored as UTC midnight
// in one path and as local-midnight-in-UTC in another, slipping past the
// (userId, reviewType, scheduledDate) unique constraint. Used to sweep them
// closed when the user completes any one of them.
function cadenceWindow(reviewType: ReviewType, scheduledDate: Date): { gte: Date; lt: Date } {
  const d = new Date(scheduledDate);
  if (reviewType === 'WEEKLY') {
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { gte: start, lt: end };
  }
  if (reviewType === 'MONTHLY') {
    return {
      gte: new Date(d.getFullYear(), d.getMonth(), 1),
      lt: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    };
  }
  return {
    gte: new Date(d.getFullYear(), 0, 1),
    lt: new Date(d.getFullYear() + 1, 0, 1),
  };
}

type Review = Awaited<ReturnType<typeof prisma.review.findUnique>>;

/** Check if an individual (non-team) review is accessible to the current user. */
function canAccessIndividualReview(review: NonNullable<Review>, userId: string, isAdmin: boolean): boolean {
  return review.isTeamReview || review.userId === userId || isAdmin;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return notFoundResponse('Review');
  if (!canAccessIndividualReview(review, auth.userId, auth.session.user.isAdmin)) {
    return notFoundResponse('Review');
  }

  const template = await findTemplate(review.reviewType, review.isTeamReview);
  return Response.json({ ...review, template });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return notFoundResponse('Review');
  if (!canAccessIndividualReview(review, auth.userId, auth.session.user.isAdmin)) {
    return notFoundResponse('Review');
  }

  const parsed = await parseBody(request, updateReviewSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: Record<string, unknown> = pickDefined(body, ['checklistState', 'notes']);

  if (body.timeBlockStart !== undefined) data.timeBlockStart = body.timeBlockStart ? new Date(body.timeBlockStart) : null;
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = body.timeBlockEnd ? new Date(body.timeBlockEnd) : null;
  if (body.complete) data.completedAt = new Date();

  let didCompleteNow = false;
  let updated;

  if (body.complete && !review.completedAt) {
    // updateMany guards the completedAt null→now transition so concurrent tabs
    // don't mis-stamp the completion time and so the GCal delete/cancel
    // branches below run for the race winner only.
    const result = await prisma.review.updateMany({
      where: { id, completedAt: null },
      data,
    });
    didCompleteNow = result.count === 1;

    // Close sibling rows in the same cadence-window so a duplicate row (same
    // week/month/year, different scheduledDate timestamp) doesn't reappear in
    // the Tasks banner after the user completes one of them.
    if (didCompleteNow) {
      const window = cadenceWindow(review.reviewType, review.scheduledDate);
      await prisma.review.updateMany({
        where: {
          userId: review.userId,
          reviewType: review.reviewType,
          isTeamReview: review.isTeamReview,
          completedAt: null,
          id: { not: id },
          scheduledDate: window,
        },
        data: { completedAt: new Date() },
      });
    }

    updated = await prisma.review.findUniqueOrThrow({ where: { id } });

    // Streak firing is NOT gated on didCompleteNow: upsertOrUpdateStreak is
    // per-day idempotent, so firing on every pre-completion snapshot is safe
    // and self-heals reviews that got completedAt set without a streak update.
    // Back-compat: keep updating the legacy 'review' streak alongside the
    // cadence-specific one.
    const cadence = REVIEW_TYPE_TO_CADENCE[review.reviewType];
    const streakType = `review_${review.reviewType.toLowerCase()}`;
    await Promise.all([
      updateSpecificStreak(auth.userId, streakType, cadence).catch((err) =>
        console.warn(`[streak] ${streakType} streak update failed:`, err),
      ),
      updateSpecificStreak(auth.userId, 'review', cadence).catch((err) =>
        console.warn('[streak] review streak update failed:', err),
      ),
    ]);
  } else {
    updated = await prisma.review.update({ where: { id }, data });
  }

  // Google Calendar sync — fire-and-forget. For the completion path, only the
  // race winner (didCompleteNow) should run the delete/cancel branches; the
  // losing tab must not re-fire a 404-producing delete.
  const completionForThisCall = body.complete ? didCompleteNow : false;
  const calendarFieldsChanged = body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined || completionForThisCall;
  if (calendarFieldsChanged) {
    const syncToGcal = async () => {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(review.userId);
      if (!hasGoogle) return;
      const newStart = updated.timeBlockStart;
      const newEnd = updated.timeBlockEnd;
      const title = `${review.reviewType} Review`;

      if (completionForThisCall && review.calendarEventId) {
        await deleteGoogleEvent(review.userId, review.calendarEventId, targetCalendarId);
        await prisma.review.update({ where: { id }, data: { calendarEventId: null } });
      } else if (completionForThisCall && !review.calendarEventId && !review.isTeamReview) {
        await cancelManagedSeriesInstance({
          userId: review.userId,
          date: updated.scheduledDate,
          selector: (state) => state.recurringReviews?.[review.reviewType],
          writer: (state, series) => {
            state.recurringReviews = state.recurringReviews ?? {};
            if (series) {
              state.recurringReviews[review.reviewType] = series;
            } else {
              delete state.recurringReviews[review.reviewType];
            }
          },
        });
      } else if (review.calendarEventId && (body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined)) {
        await updateGoogleEvent(review.userId, review.calendarEventId, {
          summary: title,
          start: newStart ? newStart.toISOString() : undefined,
          end: newEnd ? newEnd.toISOString() : undefined,
        }, targetCalendarId);
      } else if (!review.calendarEventId && newStart && newEnd && !body.complete && !review.isTeamReview) {
        await syncManagedSeriesOverride({
          userId: review.userId,
          date: updated.scheduledDate,
          start: newStart,
          end: newEnd,
          selector: (state) => state.recurringReviews?.[review.reviewType],
          writer: (state, series) => {
            state.recurringReviews = state.recurringReviews ?? {};
            if (series) {
              state.recurringReviews[review.reviewType] = series;
            } else {
              delete state.recurringReviews[review.reviewType];
            }
          },
        });
      } else if (!review.calendarEventId && newStart && newEnd && !body.complete) {
        const gcalEvent = await createGoogleEvent(review.userId, {
          summary: title,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          prismType: 'review',
        }, targetCalendarId);
        if (gcalEvent?.id) {
          await prisma.review.update({ where: { id }, data: { calendarEventId: gcalEvent.id } });
        }
      }
    };
    syncToGcal().catch((err) => console.warn(`[reviews] Google Calendar sync failed for user=${review.userId} reviewType=${review.reviewType} reviewId=${id}:`, err));
  }

  return Response.json(updated, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return notFoundResponse('Review');

  if (review.isTeamReview && !auth.session.user.isAdmin) {
    return forbiddenResponse();
  }
  if (!canAccessIndividualReview(review, auth.userId, auth.session.user.isAdmin)) {
    return notFoundResponse('Review');
  }

  await prisma.review.delete({ where: { id } });
  return Response.json({ ok: true }, { status: 200, ...NO_STORE });
}

/** Find the template for a review type, falling back from team to individual template. */
async function findTemplate(reviewType: ReviewType, isTeamReview: boolean) {
  const template = await prisma.reviewTemplate.findUnique({
    where: { reviewType_isTeamTemplate: { reviewType, isTeamTemplate: isTeamReview } },
  });
  if (template || !isTeamReview) return template;

  return prisma.reviewTemplate.findUnique({
    where: { reviewType_isTeamTemplate: { reviewType, isTeamTemplate: false } },
  });
}
