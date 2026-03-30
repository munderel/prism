import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeParseJson } from '@/lib/api-helpers';

/**
 * PATCH /api/users/[id]/admin
 * Admin-only: lock/unlock users, reset 2FA, reset accounts.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { action } = body;
  const targetUserId = params.id;

  // Prevent self-lockout
  if (targetUserId === session.user.id && action === 'lockout') {
    return NextResponse.json(
      { error: 'Cannot lock out your own account' },
      { status: 400 }
    );
  }

  switch (action) {
    case 'lockout': {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isLockedOut: true },
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    case 'unlock': {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isLockedOut: false },
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    case 'reset-2fa': {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { is2FAEnabled: false, totpSecret: null },
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    case 'reset-password': {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { passwordHash: null },
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
