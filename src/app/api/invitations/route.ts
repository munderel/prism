import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';

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

  return Response.json(invitations);
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
