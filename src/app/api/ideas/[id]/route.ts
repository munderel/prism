import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIceScore } from '@/lib/scoring';
import { pickDefined, validateIceScores, notFoundResponse, USER_SUMMARY_SELECT, safeParseJson } from '@/lib/api-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      author: { select: USER_SUMMARY_SELECT },
      process: { select: { id: true, title: true } },
      task: { select: { id: true, title: true, status: true } },
      attachments: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!idea) return notFoundResponse('Idea');

  // Non-admins can only see their own ideas
  if (idea.authorId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json(idea);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return notFoundResponse('Idea');

  // Author can edit only if SUBMITTED; admins can always edit
  const isAuthor = idea.authorId === auth.userId;
  const isAdmin = auth.session.user.isAdmin;

  if (!isAdmin && (!isAuthor || idea.status !== 'SUBMITTED')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { confidenceScore, easeScore, impactScore, status } = body;

  const data: any = pickDefined(body, ['title', 'description']);
  if (body.processId !== undefined) data.processId = body.processId || null;

  // Handle score updates
  const newImpact = impactScore ?? idea.impactScore;
  const newConfidence = confidenceScore ?? idea.confidenceScore;
  const newEase = easeScore ?? idea.easeScore;

  if (confidenceScore !== undefined || easeScore !== undefined || impactScore !== undefined) {
    const scoreError = validateIceScores({ impactScore: newImpact, confidenceScore: newConfidence, easeScore: newEase });
    if (scoreError) {
      return Response.json({ error: scoreError }, { status: 400 });
    }

    if (confidenceScore !== undefined) data.confidenceScore = confidenceScore;
    if (easeScore !== undefined) data.easeScore = easeScore;
    if (impactScore !== undefined) data.impactScore = impactScore;

    data.iceScore = computeIceScore(newImpact, newConfidence, newEase);
  }

  // Only admins can change status directly (except via /convert)
  if (status !== undefined) {
    if (!isAdmin) {
      return Response.json({ error: 'Only admins can change idea status' }, { status: 403 });
    }
    data.status = status;
  }

  const updated = await prisma.idea.update({
    where: { id },
    data,
    include: {
      author: { select: USER_SUMMARY_SELECT },
      process: { select: { id: true, title: true } },
    },
  });

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return notFoundResponse('Idea');

  // Author can delete only if SUBMITTED; admins can always delete
  const isAuthor = idea.authorId === auth.userId;
  const isAdmin = auth.session.user.isAdmin;

  if (!isAdmin && (!isAuthor || idea.status !== 'SUBMITTED')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.idea.delete({ where: { id } });

  return Response.json({ ok: true });
}
