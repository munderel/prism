import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_MAX = 10; // max invitations per hour

export async function GET(_request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      invitedBy: {
        select: { name: true, email: true },
      },
    },
  });

  // Annotate each invitation with computed expiry status
  const annotated = invitations.map((inv) => {
    const isExpired =
      inv.status === 'PENDING' &&
      Date.now() - new Date(inv.createdAt).getTime() > INVITE_EXPIRY_MS;
    return {
      ...inv,
      isExpired,
    };
  });

  return Response.json(annotated);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { email, role } = body;

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return Response.json({ error: 'Invalid email format' }, { status: 400 });
  }

  if (role && role !== 'admin' && role !== 'user') {
    return Response.json({ error: 'Role must be "admin" or "user"' }, { status: 400 });
  }

  // Rate limiting: max 10 invitations per hour per admin
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.invitation.count({
    where: {
      invitedById: auth.userId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentCount >= RATE_LIMIT_MAX) {
    return Response.json(
      { error: 'Rate limit exceeded. You can send up to 10 invitations per hour.' },
      { status: 429 }
    );
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    return Response.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Check for existing pending invitation
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      email: normalizedEmail,
      status: 'PENDING',
    },
  });
  if (existingInvitation) {
    return Response.json({ error: 'An invitation is already pending for this email' }, { status: 409 });
  }

  // Verify the inviting user exists in the database
  const invitingUser = await prisma.user.findUnique({
    where: { id: auth.userId },
  });
  if (!invitingUser) {
    return Response.json(
      { error: 'Authenticated user not found in database. Please ensure your account is set up.' },
      { status: 404 }
    );
  }

  try {
    const invitation = await prisma.invitation.create({
      data: {
        email: normalizedEmail,
        role: role || 'user',
        invitedById: auth.userId,
      },
      include: {
        invitedBy: {
          select: { name: true, email: true },
        },
      },
    });

    return Response.json(invitation, { status: 201 });
  } catch (err) {
    console.error('Failed to create invitation:', err);
    return Response.json(
      { error: 'Failed to create invitation. Please try again.' },
      { status: 500 }
    );
  }
}
