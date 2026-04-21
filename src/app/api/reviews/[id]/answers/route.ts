import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';
import { parseBody, createReviewAnswerSchema } from '@/lib/schemas';

/** Load and authorize access to a review. Returns the review or an error Response. */
async function loadReview(reviewId: string, userId: string, isAdmin: boolean) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return { error: notFoundResponse('Review') as Response };
  if (!review.isTeamReview && review.userId !== userId && !isAdmin) return { error: notFoundResponse('Review') as Response };
  return { review };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const result = await loadReview(reviewId, auth.userId, auth.session.user.isAdmin);
  if ('error' in result) return result.error;

  const answers = await prisma.reviewAnswer.findMany({
    where: { reviewId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(answers);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const result = await loadReview(reviewId, auth.userId, auth.session.user.isAdmin);
  if ('error' in result) return result.error;

  const parsed = await parseBody(request, createReviewAnswerSchema);
  if ('error' in parsed) return parsed.error;
  const { stepKey, answerType, answerData } = parsed.data;

  // Atomic upsert — two concurrent POSTs for the same (reviewId, stepKey) are
  // collapsed by the unique constraint rather than racing to insert duplicates.
  const answer = await prisma.reviewAnswer.upsert({
    where: { reviewId_stepKey: { reviewId, stepKey } },
    create: { reviewId, stepKey, answerType, answerData: answerData ?? {} },
    update: { answerType, answerData: answerData ?? {} },
  });

  return Response.json(answer);
}
