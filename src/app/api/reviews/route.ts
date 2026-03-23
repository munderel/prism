import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { getNextReviewDate } from '@/lib/review-dates';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const reviewType = searchParams.get('reviewType');

  const where: any = { userId: auth.userId };
  if (reviewType) where.reviewType = reviewType;

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { scheduledDate: 'desc' },
    take: 50,
  });

  return Response.json(reviews);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { reviewType } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  // Check for existing overdue/pending review of this type
  const existing = await prisma.review.findFirst({
    where: { userId: auth.userId, reviewType, completedAt: null },
  });

  if (existing) {
    return Response.json({ error: 'An incomplete review of this type already exists' }, { status: 409 });
  }

  const scheduledDate = getNextReviewDate(reviewType);

  const review = await prisma.review.create({
    data: {
      userId: auth.userId,
      reviewType,
      scheduledDate,
    },
  });

  return Response.json(review, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { reviewType } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  const result = await prisma.review.deleteMany({
    where: {
      userId: auth.userId,
      reviewType,
      completedAt: null,
    },
  });

  return Response.json({ success: true, deleted: result.count }, { status: 200 });
}

