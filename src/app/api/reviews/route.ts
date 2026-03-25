import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { getNextReviewDate } from '@/lib/review-dates';
import { nextDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const reviewType = searchParams.get('reviewType');
  const scope = searchParams.get('scope'); // 'team' | 'individual' | null (both)

  const conditions: any[] = [];

  // Team reviews are visible to everyone
  if (scope !== 'individual') {
    const teamWhere: any = { isTeamReview: true };
    if (reviewType) teamWhere.reviewType = reviewType;
    conditions.push(teamWhere);
  }

  // Individual reviews: owner sees their own, admin sees all
  if (scope !== 'team') {
    const individualWhere: any = { isTeamReview: false };
    if (auth.session.user.isAdmin) {
      // Admin can see all individual reviews
    } else {
      individualWhere.userId = auth.userId;
    }
    if (reviewType) individualWhere.reviewType = reviewType;
    conditions.push(individualWhere);
  }

  const reviews = await prisma.review.findMany({
    where: conditions.length === 1 ? conditions[0] : { OR: conditions },
    orderBy: { scheduledDate: 'desc' },
    take: 50,
  });

  return Response.json(reviews);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { reviewType, startDate, recurrenceDayOfWeek, isTeamReview } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  // Team reviews require admin role
  if (isTeamReview) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  }

  // Check for existing overdue/pending review of this type
  const existingWhere: any = { reviewType, completedAt: null };
  if (isTeamReview) {
    existingWhere.isTeamReview = true;
  } else {
    existingWhere.userId = auth.userId;
    existingWhere.isTeamReview = false;
  }

  const existing = await prisma.review.findFirst({ where: existingWhere });

  if (existing) {
    return Response.json({ error: 'An incomplete review of this type already exists' }, { status: 409 });
  }

  // Calculate scheduled date: use startDate + recurrenceDayOfWeek if provided
  let scheduledDate: Date;
  if (startDate && recurrenceDayOfWeek !== undefined && recurrenceDayOfWeek !== null) {
    // Find the next occurrence of the specified day of week on or after startDate
    const base = new Date(startDate);
    const dayOfWeek = recurrenceDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    if (base.getDay() === dayOfWeek) {
      scheduledDate = base;
    } else {
      scheduledDate = nextDay(base, dayOfWeek);
    }
  } else if (startDate) {
    scheduledDate = new Date(startDate);
  } else {
    scheduledDate = getNextReviewDate(reviewType);
  }

  const review = await prisma.review.create({
    data: {
      userId: auth.userId,
      reviewType,
      scheduledDate,
      startDate: startDate ? new Date(startDate) : undefined,
      recurrenceDayOfWeek: recurrenceDayOfWeek ?? undefined,
      isTeamReview: isTeamReview ?? false,
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

