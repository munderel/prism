import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, NO_STORE } from '@/lib/api-helpers';
import { InviteStatus } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const status = raw.status;
  if (status !== 'ACCEPTED' && status !== 'DECLINED') {
    return Response.json({ error: 'status must be ACCEPTED or DECLINED' }, { status: 400 });
  }

  const invitation = await prisma.aimInvitation.findUnique({ where: { id } });
  if (!invitation) return notFoundResponse('AimInvitation');
  if (invitation.inviteeId !== auth.userId) return forbiddenResponse();

  // Idempotent: if status already matches, return early
  if (invitation.status === (status as InviteStatus)) {
    return Response.json({ ok: true, invitation }, NO_STORE);
  }

  const updated = await prisma.aimInvitation.update({
    where: { id },
    data: {
      status: status as InviteStatus,
      respondedAt: new Date(),
    },
  });

  // Mark any associated in-app notification as read
  await prisma.notification.updateMany({
    where: {
      userId: auth.userId,
      type: 'AIM_INVITE',
      readAt: null,
      payload: {
        path: ['url'],
        string_contains: id,
      },
    },
    data: { readAt: new Date() },
  }).catch((err) => console.error('[invitations] Failed to mark notification read:', err));

  return Response.json({ ok: true, invitation: updated }, NO_STORE);
}
