import { prisma } from '@/lib/prisma';

export async function GET() {
  const results: Record<string, any> = {
    dbUrlSet: !!process.env.DATABASE_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL ?? 'NOT SET',
    tokenKeySet: !!process.env.TOKEN_ENCRYPTION_KEY,
    googleIdSet: !!process.env.GOOGLE_CLIENT_ID,
    googleSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    results.userCount = await prisma.user.count();
    results.accountCount = await prisma.account.count();

    // Check which tables exist (confirms migrations ran)
    try {
      const tables = await prisma.$queryRaw<{tablename: string}[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `;
      results.tables = tables.map(t => t.tablename);
    } catch (tableErr: any) {
      results.tables = 'error: ' + tableErr.message;
    }

    results.dbStatus = 'connected';
  } catch (e: any) {
    results.dbStatus = 'error';
    results.dbError = e.message;
  }

  return Response.json(results);
}
