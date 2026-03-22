import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';
import { commentLimiter, getClientIp } from '@/lib/rate-limit';
import { extractMentions, resolveMentions } from '@/lib/mention-parser';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, image: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  return Response.json(comments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  const ip = getClientIp(request);
  const limit = commentLimiter.check(ip);
  if (!limit.success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { content } = body;

  if (!content?.trim()) {
    return Response.json({ error: 'Content is required' }, { status: 400 });
  }

  // Extract and resolve @mentions
  const mentionNames = extractMentions(content);
  let resolvedMentions: { id: string; name: string }[] = [];

  if (mentionNames.length > 0) {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
    });
    resolvedMentions = resolveMentions(mentionNames, users);
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      authorId: auth.userId,
      content,
      mentions: {
        create: resolvedMentions.map((u) => ({
          userId: u.id,
        })),
      },
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  return Response.json(comment, { status: 201 });
}
