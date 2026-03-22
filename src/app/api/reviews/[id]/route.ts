import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { addWeeks, addMonths, nextSunday, startOfMonth } from 'date-fns';

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

    // Auto-schedule next review of same type
    const nextDate = getNextReviewDate(review.reviewType);
    await prisma.review.create({
      data: {
        userId: auth.userId,
        reviewType: review.reviewType,
        scheduledDate: nextDate,
      },
    });
  }

  const updated = await prisma.review.update({ where: { id }, data });
  return Response.json(updated);
}

function getNextReviewDate(reviewType: string): Date {
  const now = new Date();
  switch (reviewType) {
    case 'WEEKLY':
      return nextSunday(now);
    case 'MONTHLY':
      return startOfMonth(addMonths(now, 1));
    case 'QUARTERLY': {
      const month = now.getMonth();
      const nextQ = [3, 6, 9, 0].find((m) => m > month) ?? 3;
      const year = nextQ === 3 && month >= 10 ? now.getFullYear() + 1 : now.getFullYear();
      return new Date(year, nextQ === 0 ? 0 : nextQ, 1);
    }
    case 'YEARLY':
      return new Date(now.getFullYear() + 1, 0, 1);
    default:
      return addWeeks(now, 1);
  }
}
