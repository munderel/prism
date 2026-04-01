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

  // Test 1: Count users
  try {
    results.userCount = await prisma.user.count();
    results.accountCount = await prisma.account.count();
    results.dbStatus = 'connected';
  } catch (e: any) {
    results.dbStatus = 'error';
    results.dbError = e.message;
    return Response.json(results);
  }

  // Test 2: Simulate PrismaAdapter.createUser (what happens during OAuth)
  const testEmail = `test-${Date.now()}@test.local`;
  try {
    const testUser = await prisma.user.create({
      data: { email: testEmail, name: 'Test User' },
    });
    results.createUser = 'OK';
    results.testUserId = testUser.id;

    // Test 3: Simulate PrismaAdapter.linkAccount
    try {
      await prisma.account.create({
        data: {
          userId: testUser.id,
          type: 'oauth',
          provider: 'test-provider',
          providerAccountId: `test-${Date.now()}`,
          access_token: 'test-token',
          token_type: 'bearer',
        },
      });
      results.linkAccount = 'OK';
    } catch (e: any) {
      results.linkAccount = 'FAILED';
      results.linkAccountError = e.message;
    }

    // Cleanup
    await prisma.account.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    results.cleanup = 'OK';
  } catch (e: any) {
    results.createUser = 'FAILED';
    results.createUserError = e.message;
  }

  return Response.json(results);
}
