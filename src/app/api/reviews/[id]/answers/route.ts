import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

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

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { stepKey, answerType, answerData } = body;

  if (!stepKey || !answerType) {
    return Response.json({ error: 'stepKey and answerType are required' }, { status: 400 });
  }

  // Upsert: find existing answer for this review + stepKey, update or create
  const existing = await prisma.reviewAnswer.findFirst({
    where: { reviewId, stepKey },
  });

  if (existing) {
    const updated = await prisma.reviewAnswer.update({
      where: { id: existing.id },
      data: { answerType, answerData: answerData ?? {} },
    });
    return Response.json(updated);
  }

  const answer = await prisma.reviewAnswer.create({
    data: {
      reviewId,
      stepKey,
      answerType,
      answerData: answerData ?? {},
    },
  });

  return Response.json(answer, { status: 201 });
}
