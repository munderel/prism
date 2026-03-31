import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, NO_STORE } from '@/lib/api-helpers';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isInviteExpired(inv: { status: string; createdAt: Date }): boolean {
  return inv.status === 'PENDING' && Date.now() - new Date(inv.createdAt).getTime() > INVITE_EXPIRY_MS;
}

/** Public endpoint -- unauthenticated invitees can view basic invitation details. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { invitedBy: { select: { name: true } } },
  });

  if (!invitation) return notFoundResponse('Invitation');

  return Response.json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: isInviteExpired(invitation) ? 'EXPIRED' : invitation.status,
    invitedByName: invitation.invitedBy?.name ?? 'a team admin',
    createdAt: invitation.createdAt,
  });
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const invitation = await prisma.invitation.findUnique({ where: { id } });

  if (!invitation) return notFoundResponse('Invitation');

  if (invitation.status !== 'PENDING') {
    return Response.json({ error: 'Only pending invitations can be revoked' }, { status: 400 });
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });

  return Response.json(updated, NO_STORE);
}
