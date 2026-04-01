import { prisma } from '@/lib/prisma';

export async function GET() {
  let dbStatus = 'unknown';
  let userCount = -1;
  let accountCount = -1;
  let dbError = '';

  try {
    userCount = await prisma.user.count();
    accountCount = await prisma.account.count();
    dbStatus = 'connected';
  } catch (e: any) {
    dbStatus = 'error';
    dbError = e.message;
  }

  return Response.json({
    dbStatus,
    dbError,
    userCount,
    accountCount,
    dbUrlSet: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) ?? 'NOT SET',
    nextAuthUrl: process.env.NEXTAUTH_URL ?? 'NOT SET',
    tokenKeySet: !!process.env.TOKEN_ENCRYPTION_KEY,
    googleIdSet: !!process.env.GOOGLE_CLIENT_ID,
    googleSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
