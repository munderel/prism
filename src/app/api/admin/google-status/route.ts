import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { decryptToken } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const userId = searchParams.get('userId');

  if (!email && !userId) {
    return Response.json({ error: 'Provide email or userId query param' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: email ? { email: email.toLowerCase() } : { id: userId! },
    select: {
      id: true,
      email: true,
      name: true,
      googleRefreshToken: true,
      syncTargetCalendarId: true,
      selectedCalendarIds: true,
    },
  });

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const account = await prisma.account.findFirst({
    where: { userId: user.id, provider: 'google' },
    select: { id: true, expires_at: true },
  });

  const hasRefreshToken = !!user.googleRefreshToken;
  let canDecryptToken = false;
  if (hasRefreshToken && process.env.TOKEN_ENCRYPTION_KEY) {
    const decrypted = decryptToken(user.googleRefreshToken!);
    // If token has colons it's encrypted format; if decryption fails → key mismatch
    canDecryptToken = decrypted !== null || !user.googleRefreshToken!.includes(':');
  } else if (hasRefreshToken) {
    // No encryption key set — token is plaintext, readable as-is
    canDecryptToken = true;
  }

  return Response.json({
    userId: user.id,
    email: user.email,
    name: user.name,
    hasRefreshToken,
    hasAccountRecord: !!account,
    canDecryptToken,
    accountExpiresAt: account?.expires_at
      ? new Date(account.expires_at * 1000).toISOString()
      : null,
    selectedCalendarIds: user.selectedCalendarIds,
    syncTargetCalendarId: user.syncTargetCalendarId ?? 'primary',
  });
}
