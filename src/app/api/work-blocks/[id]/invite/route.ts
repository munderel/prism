import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, NO_STORE } from '@/lib/api-helpers';
import { notifyUser } from '@/lib/notifications';
import { NotificationType } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Load the WorkBlock and verify ownership
  const workBlock = await prisma.workBlock.findFirst({
    where: { id, userId: auth.userId },
    include: {
      task: { select: { title: true } },
    },
  });
  if (!workBlock) return notFoundResponse('WorkBlock');
  // findFirst already scopes to auth.userId, so no separate ownership check needed
  if (workBlock.userId !== auth.userId) return forbiddenResponse();

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const userIds = raw.userIds;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return Response.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
  }
  const validIds = (userIds as unknown[]).filter((uid) => typeof uid === 'string') as string[];
  if (validIds.includes(auth.userId)) {
    return Response.json({ error: 'Cannot invite yourself' }, { status: 400 });
  }

  const taskTitle = workBlock.task?.title ?? 'a work session';
  const created: string[] = [];
  for (const inviteeId of validIds) {
    try {
      const inv = await prisma.workBlockInvitation.create({
        data: {
          workBlockId: id,
          inviterId: auth.userId,
          inviteeId,
        },
      });
      created.push(inv.id);

      // Fire notification — non-blocking. URL deep-links to the work-block
      // edit page (not /aims) so the recipient can see the actual block.
      notifyUser(
        inviteeId,
        'Work Block Invitation',
        `You've been invited to join a work block: "${workBlock.mainObjective}" (${taskTitle}).`,
        `/work-blocks/${workBlock.id}/edit?invitation=${inv.id}`,
        NotificationType.WORKBLOCK_INVITE,
      ).catch((err) => console.error('[invitations] notifyUser failed:', err));
    } catch (err: unknown) {
      // P2002 = unique constraint violation → already invited, treat as idempotent
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === 'P2002') continue;
      throw err;
    }
  }

  return Response.json({ ok: true, created }, NO_STORE);
}
