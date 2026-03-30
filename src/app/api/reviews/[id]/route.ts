import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson } from '@/lib/api-helpers';


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return notFoundResponse('Review');

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
  if (!review) return notFoundResponse('Review');

  // Team reviews: any authenticated user can update; individual: only owner/admin
  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { checklistState, notes, complete, timeBlockStart, timeBlockEnd } = body;

  const data: any = {};
  if (checklistState !== undefined) data.checklistState = checklistState;
  if (notes !== undefined) data.notes = notes;
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;

  if (complete) {
    data.completedAt = new Date();
  }

  const updated = await prisma.review.update({ where: { id }, data });
  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
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

  // Team reviews: only admin can delete; individual: owner or admin
  if (review.isTeamReview && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!review.isTeamReview && review.userId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.review.delete({ where: { id } });
  return Response.json({ ok: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
