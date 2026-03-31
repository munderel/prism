import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { computeIceScore } from '@/lib/scoring';
import { pickDefined, validateIceScores, notFoundResponse, forbiddenResponse, USER_SUMMARY_SELECT, safeParseJson } from '@/lib/api-helpers';

/**
 * Check if the user can mutate an idea.
 * Authors can only mutate their own ideas while in SUBMITTED status; admins can always mutate.
 */
function canMutateIdea(idea: { authorId: string; status: string }, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return idea.authorId === userId && idea.status === 'SUBMITTED';
}

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

  if (idea.authorId !== auth.userId && !auth.session.user.isAdmin) {
    return forbiddenResponse();
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

  const isAdmin = auth.session.user.isAdmin;

  if (!canMutateIdea(idea, auth.userId, isAdmin)) {
    return forbiddenResponse();
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

  if (!canMutateIdea(idea, auth.userId, auth.session.user.isAdmin)) {
    return forbiddenResponse();
  }

  await prisma.idea.delete({ where: { id } });

  return Response.json({ ok: true });
}
