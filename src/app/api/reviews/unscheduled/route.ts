import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

const REVIEW_DURATION_MIN: Record<string, number> = {
  WEEKLY: 30,
  MONTHLY: 60,
  YEARLY: 180,
};

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const reviews = await prisma.review.findMany({
    where: {
      userId: auth.userId,
      completedAt: null,
      timeBlockStart: null,
    },
    orderBy: { scheduledDate: 'asc' },
  });

  const items = reviews.map((r) => ({
    id: `review-${r.id}`,
    type: 'review' as const,
    title: `${r.reviewType.charAt(0) + r.reviewType.slice(1).toLowerCase()} Review`,
    reviewId: r.id,
    reviewType: r.reviewType,
    duration: REVIEW_DURATION_MIN[r.reviewType] ?? 30,
    scheduledDate: r.scheduledDate.toISOString(),
    source: 'reviews' as const,
  }));

  return Response.json(items);
}
