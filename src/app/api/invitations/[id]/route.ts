import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * GET /api/invitations/[id]
 * Public endpoint — returns basic invitation details for the accept-invite page.
 * Does NOT require authentication so unauthenticated invitees can see the invite.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: {
      invitedBy: {
        select: { name: true },
      },
    },
  });

  if (!invitation) {
    return Response.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const isExpired =
    invitation.status === 'PENDING' &&
    Date.now() - new Date(invitation.createdAt).getTime() > INVITE_EXPIRY_MS;

  return Response.json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: isExpired ? 'EXPIRED' : invitation.status,
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

  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return Response.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invitation.status !== 'PENDING') {
    return Response.json({ error: 'Only pending invitations can be revoked' }, { status: 400 });
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}
