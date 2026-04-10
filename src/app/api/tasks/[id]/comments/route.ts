import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';
import { parseBody, createCommentSchema } from '@/lib/schemas';

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

  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createCommentSchema);
  if ('error' in parsed) return parsed.error;
  const { content } = parsed.data;

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
