import { prisma } from '@/lib/prisma';
import { requireCronSecret } from '@/lib/auth-guard';
import { createLogger } from '@/lib/logger';

const log = createLogger('health');

// Public health check. The route is excluded from the auth middleware, so the
// anonymous response is deliberately minimal: { ok, dbStatus } and nothing
// else — no env presence flags, no URLs, no counts, no raw error messages.
// Operators (GitHub Actions / owner) can request the verbose diagnostic
// payload by authenticating with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    let dbStatus: 'connected' | 'error' = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e: unknown) {
      dbStatus = 'error';
      log.error('DB ping failed', { message: e instanceof Error ? e.message : String(e) });
    }
    return Response.json({ ok: true, dbStatus });
  }

  // Verbose operator diagnostics — only reachable with the cron secret.
  const results: Record<string, unknown> = {
    dbUrlSet: !!process.env.DATABASE_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL ?? 'NOT SET',
    tokenKeySet: !!process.env.TOKEN_ENCRYPTION_KEY,
    googleIdSet: !!process.env.GOOGLE_CLIENT_ID,
    googleSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const userCount = await prisma.user.count();
    const accountCount = await prisma.account.count();
    results.userCount = userCount;
    results.accountCount = accountCount;
    results.dbStatus = 'connected';
    log.debug('DB queries successful', { userCount, accountCount });
  } catch (e: unknown) {
    results.dbStatus = 'error';
    results.dbError = e instanceof Error ? e.message : String(e);
    log.error('DB error', { message: e instanceof Error ? e.message : String(e) });
  }

  return Response.json(results);
}
