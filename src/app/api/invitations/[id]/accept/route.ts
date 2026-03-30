import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/invitations/[id]/accept
 * Accepts an invitation. Requires the user to be authenticated (post-OAuth).
 * Links the authenticated user to the invitation and applies the invited role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Read token from query string or request body
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  let bodyToken: string | undefined;
  try {
    const body = await request.json();
    bodyToken = body.token;
  } catch {
    // No body is fine if token is in query string
  }
  const token = bodyToken || queryToken;

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

  // Verify invitation token (for invitations that have one) — timing-safe comparison
  if (invitation.token) {
    if (!token) {
      return Response.json(
        { error: 'Invalid invitation token. Please use the link from your invitation email.' },
        { status: 403 }
      );
    }
    const expected = Buffer.from(invitation.token, 'utf-8');
    const provided = Buffer.from(token, 'utf-8');
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return Response.json(
        { error: 'Invalid invitation token. Please use the link from your invitation email.' },
        { status: 403 }
      );
    }
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

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
