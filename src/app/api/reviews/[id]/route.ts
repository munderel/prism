import { NextRequest } from 'next/server';
import { ReviewType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateReviewSchema } from '@/lib/schemas';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { cancelManagedSeriesInstance, syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { updateSpecificStreak, updateDailyStreak, type StreakUpdateResult } from '@/lib/streak-engine';

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
  let beeminderError: string | undefined;

  if (body.timeBlockStart !== undefined) data.timeBlockStart = body.timeBlockStart ? new Date(body.timeBlockStart) : null;
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = body.timeBlockEnd ? new Date(body.timeBlockEnd) : null;
  if (body.complete) data.completedAt = new Date();

  if (body.complete && !review.completedAt) {
    updateSpecificStreak(auth.userId, 'reviews').catch((err) => console.warn('[streak] update failed:', err));
    const streakResult = await updateDailyStreak(auth.userId, 'reviews').catch((err) => { console.warn('[streak] update failed:', err); return {} as StreakUpdateResult; });
    if (streakResult?.beeminder?.ok === false) {
      beeminderError = streakResult.beeminder.error;
    }
  }

  const updated = await prisma.review.update({ where: { id }, data });

  // Google Calendar sync — fire-and-forget
  const calendarFieldsChanged = body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined || body.complete;
  if (calendarFieldsChanged) {
    const syncToGcal = async () => {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(review.userId);
      if (!hasGoogle) return;
      const newStart = updated.timeBlockStart;
      const newEnd = updated.timeBlockEnd;
      const title = `${review.reviewType} Review`;

      if (body.complete && review.calendarEventId) {
        await deleteGoogleEvent(review.userId, review.calendarEventId, targetCalendarId);
        await prisma.review.update({ where: { id }, data: { calendarEventId: null } });
      } else if (body.complete && !review.calendarEventId && !review.isTeamReview) {
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
        }, targetCalendarId);
        if (gcalEvent?.id) {
          await prisma.review.update({ where: { id }, data: { calendarEventId: gcalEvent.id } });
        }
      }
    };
    syncToGcal().catch((err) => console.warn(`[reviews] Google Calendar sync failed for user=${review.userId} reviewType=${review.reviewType} reviewId=${id}:`, err));
  }

  return Response.json({ ...updated, beeminderError }, NO_STORE);
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
