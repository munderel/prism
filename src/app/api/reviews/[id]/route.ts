import { NextRequest } from 'next/server';
import { ReviewType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';

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

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: any = pickDefined(body, ['checklistState', 'notes']);

  if (body.timeBlockStart !== undefined) data.timeBlockStart = body.timeBlockStart ? new Date(body.timeBlockStart) : null;
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = body.timeBlockEnd ? new Date(body.timeBlockEnd) : null;
  if (body.complete) data.completedAt = new Date();

  const updated = await prisma.review.update({ where: { id }, data });
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
