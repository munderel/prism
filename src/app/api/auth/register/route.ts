import { prisma } from '@/lib/prisma';
import { NO_STORE } from '@/lib/api-helpers';
import bcrypt from 'bcryptjs';
import { parseBody, registerSchema } from '@/lib/schemas';

/**
 * POST /api/auth/register
 * Invite-only registration with email + password.
 * Requires a valid invitation token.
 */
export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, registerSchema);
    if ('error' in parsed) return parsed.error;
    const { email, password, name, invitationId } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limiting: max 5 registration attempts per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAttempts = await prisma.loginAttempt.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentAttempts >= 5) {
      return Response.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify invitation exists and is valid
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        email: normalizedEmail,
        status: 'PENDING',
      },
    });

    if (!invitation) {
      return Response.json(
        { error: 'Invalid or expired invitation' },
        { status: 403 }
      );
    }

    // Check if user already exists (e.g. via Google OAuth)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser?.passwordHash) {
      return Response.json(
        { error: 'Account already has a password set' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const acceptInvitation = prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    if (existingUser) {
      // Add password to existing OAuth account
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            name: name || existingUser.name,
            isAdmin: invitation.role === 'admin' || existingUser.isAdmin,
          },
        }),
        acceptInvitation,
      ]);

      return Response.json({ ok: true, userId: existingUser.id }, NO_STORE);
    }

    // Create new user
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          passwordHash,
          isAdmin: invitation.role === 'admin',
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      return newUser;
    });

    return Response.json({ ok: true, userId: user.id }, NO_STORE);
  } catch (error) {
    console.error('[register] Error:', error);
    return Response.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
