import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, NO_STORE, isInviteExpired } from '@/lib/api-helpers';

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

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { id } });
    if (!invitation) return { error: 'not_found' as const };
    if (invitation.status !== 'PENDING' && invitation.status !== 'ACCEPTED') {
      return { error: 'invalid_status' as const };
    }

    const inv = await tx.invitation.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    // Prevent continued access for the associated user
    const existingUser = await tx.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isAdmin: true },
    });
    if (existingUser && !existingUser.isAdmin) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: { isLockedOut: true },
      });
    }

    return { data: inv };
  });

  if ('error' in result) {
    if (result.error === 'not_found') return notFoundResponse('Invitation');
    return Response.json({ error: 'Only pending or accepted invitations can be revoked' }, { status: 400 });
  }

  return Response.json(result.data, NO_STORE);
}

/** Delete a revoked invitation and its associated user (admin-only cleanup). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { id } });
    if (!invitation) return { error: 'not_found' as const };
    if (invitation.status !== 'REVOKED') return { error: 'invalid_status' as const };

    const existingUser = await tx.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isAdmin: true },
    });
    if (existingUser && !existingUser.isAdmin) {
      await tx.user.delete({ where: { id: existingUser.id } });
    }

    await tx.invitation.delete({ where: { id } });
    return { ok: true };
  });

  if ('error' in result) {
    if (result.error === 'not_found') return notFoundResponse('Invitation');
    return Response.json({ error: 'Only revoked invitations can be deleted' }, { status: 400 });
  }

  return new Response(null, { status: 204 });
}
