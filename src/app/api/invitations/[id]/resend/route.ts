import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, NO_STORE } from '@/lib/api-helpers';
import { isEmailTransportConfigured, sendInviteEmail } from '@/lib/notifications';
import { verifyRequestOrigin } from '@/lib/origin-check';

const RATE_LIMIT_MAX = 10; // max invitations (incl. resends) per hour per admin

/**
 * Resend a PENDING invitation. Regenerates the token (invalidating the old
 * invite link) and resets `createdAt` so the 7-day expiry window restarts, then
 * re-sends the invite email. Admin-only; counts against the same 10/hour budget
 * as POST /api/invitations.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // This route is excluded from the middleware matcher (all of /api/invitations
  // is), so the same-origin CSRF check runs inline here, mirroring POST
  // /api/invitations.
  if (!verifyRequestOrigin(request)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { invitedBy: { select: { name: true, email: true } } },
  });
  if (!invitation) return notFoundResponse('Invitation');
  if (invitation.status !== 'PENDING') {
    return Response.json(
      { error: 'Only pending invitations can be resent' },
      { status: 409 }
    );
  }

  // Rate limiting: max 10 invitations per hour per admin (shared with POST /api/invitations)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.invitation.count({
    where: { invitedById: auth.userId, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= RATE_LIMIT_MAX) {
    return Response.json(
      { error: 'Rate limit exceeded. You can send up to 10 invitations per hour.' },
      { status: 429 }
    );
  }

  // Regenerate the token (invalidates the old link) and restart the 7-day
  // window by resetting createdAt.
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const updated = await prisma.invitation.update({
    where: { id },
    data: { token: verificationToken, createdAt: new Date() },
    include: { invitedBy: { select: { name: true, email: true } } },
  });

  const inviteUrl = `/accept-invite/${updated.id}?token=${verificationToken}`;

  // Build full URL for email (same construction as POST /api/invitations).
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const origin = request.headers.get('origin') ?? (host ? `${proto}://${host}` : '');
  const fullInviteUrl = origin ? `${origin}${inviteUrl}` : inviteUrl;

  const emailResult = isEmailTransportConfigured()
    ? await sendInviteEmail(
        updated.email,
        updated.invitedBy.name ?? 'A team member',
        fullInviteUrl
      )
    : {
        configured: false,
        sent: false,
        error: 'Invite email is not configured for this environment.',
      };

  return Response.json(
    {
      ...updated,
      inviteUrl,
      emailConfigured: emailResult.configured,
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    },
    NO_STORE
  );
}
