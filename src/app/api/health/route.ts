export async function GET() {
  return Response.json({
    dbUrlSet: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) ?? 'NOT SET',
    nextAuthUrl: process.env.NEXTAUTH_URL ?? 'NOT SET',
    nodeEnv: process.env.NODE_ENV,
  });
}
