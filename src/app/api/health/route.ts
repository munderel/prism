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
    results.dbStatus = 'connected';
  } catch (e: any) {
    results.dbStatus = 'error';
    results.dbError = e.message;
  }

  return Response.json(results);
}
