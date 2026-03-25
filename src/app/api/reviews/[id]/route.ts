import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { getNextReviewDate } from '@/lib/review-dates';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Team reviews are accessible to all authenticated users; individual reviews only to owner/admin
  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Include the template (prefer team template for team reviews)
  const template = await prisma.reviewTemplate.findUnique({
    where: {
      reviewType_isTeamTemplate: {
        reviewType: review.reviewType,
        isTeamTemplate: review.isTeamReview,
      },
    },
  });

  // Fallback to individual template if no team template exists
  const fallbackTemplate = !template && review.isTeamReview
    ? await prisma.reviewTemplate.findUnique({
        where: {
          reviewType_isTeamTemplate: {
            reviewType: review.reviewType,
            isTeamTemplate: false,
          },
        },
      })
    : null;

  return Response.json({ ...review, template: template ?? fallbackTemplate });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Team reviews: any authenticated user can update; individual: only owner/admin
  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { checklistState, notes, complete, timeBlockStart, timeBlockEnd } = body;

  const data: any = {};
  if (checklistState !== undefined) data.checklistState = checklistState;
  if (notes !== undefined) data.notes = notes;
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;

  if (complete) {
    data.completedAt = new Date();

    // Only auto-schedule next review if user hasn't disabled reviews
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: auth.userId },
    });

    if (!prefs || prefs.reviewNags) {
      const nextDate = getNextReviewDate(review.reviewType);
      await prisma.review.create({
        data: {
          userId: auth.userId,
          reviewType: review.reviewType,
          scheduledDate: nextDate,
          isTeamReview: review.isTeamReview,
          startDate: review.startDate,
          recurrenceDayOfWeek: review.recurrenceDayOfWeek,
        },
      });
    }
  }

  const updated = await prisma.review.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Team reviews: only admin can delete; individual: owner or admin
  if (review.isTeamReview && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.review.delete({ where: { id } });
  return Response.json({ success: true }, { status: 200 });
}
