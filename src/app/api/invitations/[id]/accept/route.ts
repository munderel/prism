import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/invitations/[id]/accept
 * Accepts an invitation. Requires the user to be authenticated (post-OAuth).
 * Links the authenticated user to the invitation and applies the invited role.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return Response.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invitation.status === 'REVOKED') {
    return Response.json({ error: 'This invitation has been revoked' }, { status: 400 });
  }

  if (invitation.status === 'ACCEPTED') {
    return Response.json({ error: 'This invitation has already been accepted' }, { status: 400 });
  }

  // Check expiry: createdAt + 7 days
  const isExpired =
    Date.now() - new Date(invitation.createdAt).getTime() > INVITE_EXPIRY_MS;

  if (isExpired) {
    return Response.json({ error: 'This invitation has expired' }, { status: 400 });
  }

  // Verify the authenticated user's email matches the invitation
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return Response.json(
      {
        error: `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
      },
      { status: 403 }
    );
  }

  // Accept the invitation and apply the role
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Only promote to admin via invitation; never demote an existing admin
    if (invitation.role === 'admin') {
      await tx.user.update({
        where: { id: auth.userId },
        data: { isAdmin: true },
      });
    }
  });

  return Response.json({ success: true, message: 'Invitation accepted' });
}
