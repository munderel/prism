import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createInvitationSchema } from '@/lib/schemas';
import { sendInviteEmail } from '@/lib/notifications';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MAX = 10; // max invitations per hour

function isInviteExpired(inv: { status: string; createdAt: Date }): boolean {
  return inv.status === 'PENDING' && Date.now() - new Date(inv.createdAt).getTime() > INVITE_EXPIRY_MS;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { invitedBy: { select: { name: true, email: true } } },
  });

  const annotated = invitations.map((inv) => ({ ...inv, isExpired: isInviteExpired(inv) }));
  return Response.json(annotated);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createInvitationSchema);
  if ('error' in parsed) return parsed.error;
  const { email, role } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // Rate limiting: max 10 invitations per hour per admin
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

  // Check for conflicts
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return Response.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const existingInvitation = await prisma.invitation.findFirst({
    where: { email: normalizedEmail, status: 'PENDING' },
  });
  if (existingInvitation) {
    return Response.json({ error: 'An invitation is already pending for this email' }, { status: 409 });
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const invitation = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      role: role || 'user',
      invitedById: auth.userId,
      token: verificationToken,
    },
    include: { invitedBy: { select: { name: true, email: true } } },
  });

  const inviteUrl = `/accept-invite/${invitation.id}?token=${verificationToken}`;

  // Send invite email (fire-and-forget)
  const origin = request.headers.get('origin') ?? request.headers.get('x-forwarded-host') ?? '';
  const fullInviteUrl = origin ? `${origin}${inviteUrl}` : inviteUrl;
  sendInviteEmail(normalizedEmail, invitation.invitedBy.name ?? 'A team member', fullInviteUrl).catch(() => {});

  return Response.json(
    { ...invitation, inviteUrl },
    { status: 201, ...NO_STORE }
  );
}
