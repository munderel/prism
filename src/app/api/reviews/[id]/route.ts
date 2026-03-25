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
  if (!review || review.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Include the template
  const template = await prisma.reviewTemplate.findUnique({
    where: { reviewType: review.reviewType },
  });

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
  if (!review || review.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const { checklistState, notes, complete } = body;

  const data: any = {};
  if (checklistState !== undefined) data.checklistState = checklistState;
  if (notes !== undefined) data.notes = notes;

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
  if (!review || review.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.review.delete({ where: { id } });
  return Response.json({ success: true }, { status: 200 });
}

