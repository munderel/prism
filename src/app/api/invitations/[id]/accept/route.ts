import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, NO_STORE, INVITE_EXPIRY_MS } from '@/lib/api-helpers';

const TOKEN_ERROR = 'Invalid invitation token. Please use the link from your invitation email.';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  // Read token from query string or request body
  const queryToken = new URL(request.url).searchParams.get('token');
  let bodyToken: string | undefined;
  try {
    bodyToken = (await request.json()).token;
  } catch {
    // No body is fine if token is in query string
  }
  const token = bodyToken || queryToken;

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation) return notFoundResponse('Invitation');

  if (invitation.status === 'REVOKED') {
    return Response.json({ error: 'This invitation has been revoked' }, { status: 400 });
  }
  if (invitation.status === 'ACCEPTED') {
    return Response.json({ error: 'This invitation has already been accepted' }, { status: 400 });
  }
  if (Date.now() - new Date(invitation.createdAt).getTime() > INVITE_EXPIRY_MS) {
    return Response.json({ error: 'This invitation has expired' }, { status: 400 });
  }

  // Verify invitation token (timing-safe comparison)
  if (invitation.token) {
    if (!token) {
      return Response.json({ error: TOKEN_ERROR }, { status: 403 });
    }
    const expected = Buffer.from(invitation.token, 'utf-8');
    const provided = Buffer.from(token, 'utf-8');
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return Response.json({ error: TOKEN_ERROR }, { status: 403 });
    }
  }

  // Verify the authenticated user's email matches the invitation
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  });
  if (!user) return notFoundResponse('User');

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return Response.json(
      { error: `This invitation was sent to ${invitation.email}. Please sign in with that email address.` },
      { status: 403 }
    );
  }

  // Accept the invitation and apply the role
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    // Only promote to admin via invitation; never demote an existing admin
    if (invitation.role === 'admin') {
      await tx.user.update({
        where: { id: auth.userId },
        data: { isAdmin: true },
      });
    }
  });

  return Response.json({ ok: true }, NO_STORE);
}
