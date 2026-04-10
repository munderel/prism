import { prisma } from '@/lib/prisma';

export async function GET() {
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
    console.log('[health] DB queries successful, userCount:', userCount, 'accountCount:', accountCount);
  } catch (e: unknown) {
    results.dbStatus = 'error';
    results.dbError = e instanceof Error ? e.message : String(e);
    console.error('[health] DB error:', e instanceof Error ? e.message : e);
  }

  return Response.json(results);
}
