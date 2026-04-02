import { requireAuth, authError } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/crypto';
import { getCalendarClient } from '@/lib/calendar';

/**
 * Temporary diagnostic endpoint to debug Google Calendar connection issues.
 * DELETE THIS FILE once the issue is resolved.
 */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const diagnostics: Record<string, unknown> = {};

  // 1. Check user record
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      googleRefreshToken: true,
      selectedCalendarIds: true,
      syncTargetCalendarId: true,
    },
  });

  diagnostics.hasUser = !!user;
  diagnostics.hasRefreshToken = !!user?.googleRefreshToken;
  diagnostics.refreshTokenLength = user?.googleRefreshToken?.length ?? 0;
  diagnostics.tokenLooksEncrypted = user?.googleRefreshToken?.includes(':') ?? false;
  diagnostics.selectedCalendarIds = user?.selectedCalendarIds;
  diagnostics.syncTargetCalendarId = user?.syncTargetCalendarId;

  // 2. Check Account record
  const account = await prisma.account.findFirst({
    where: { userId: auth.userId, provider: 'google' },
    select: {
      id: true,
      access_token: true,
      expires_at: true,
      scope: true,
    },
  });

  diagnostics.hasAccount = !!account;
  diagnostics.hasAccessToken = !!account?.access_token;
  diagnostics.accessTokenLength = account?.access_token?.length ?? 0;
  diagnostics.expiresAt = account?.expires_at;
  diagnostics.expiresAtDate = account?.expires_at ? new Date(account.expires_at * 1000).toISOString() : null;
  diagnostics.isExpired = account?.expires_at ? (account.expires_at * 1000) < Date.now() : null;
  diagnostics.scope = account?.scope;

  // 3. Check encryption
  diagnostics.hasEncryptionKey = !!process.env.TOKEN_ENCRYPTION_KEY;
  diagnostics.encryptionKeyLength = process.env.TOKEN_ENCRYPTION_KEY?.length ?? 0;

  if (user?.googleRefreshToken && process.env.TOKEN_ENCRYPTION_KEY) {
    const decrypted = decryptToken(user.googleRefreshToken);
    diagnostics.decryptionSucceeded = !!decrypted;
    diagnostics.decryptedTokenLength = decrypted?.length ?? 0;
  }

  // 4. Try to create calendar client
  const calendar = await getCalendarClient(auth.userId);
  diagnostics.calendarClientCreated = !!calendar;

  // 5. If client exists, try a lightweight API call
  if (calendar) {
    try {
      const response = await calendar.calendarList.list({ maxResults: 1 });
      diagnostics.apiCallSucceeded = true;
      diagnostics.calendarCount = response.data.items?.length ?? 0;
    } catch (err: any) {
      diagnostics.apiCallSucceeded = false;
      diagnostics.apiError = err?.message ?? String(err);
      diagnostics.apiErrorCode = err?.code;
      diagnostics.apiErrorStatus = err?.response?.status;
      diagnostics.apiErrorData = err?.response?.data;
    }
  }

  return Response.json(diagnostics);
}
