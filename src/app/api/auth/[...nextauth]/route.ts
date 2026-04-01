import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const nextAuth = NextAuth(authOptions);

async function handler(req: Request, ctx: any) {
  try {
    return await nextAuth(req, ctx);
  } catch (error: any) {
    console.error('[nextauth] Unhandled error:', error.message, error.stack);
    throw error;
  }
}

export { handler as GET, handler as POST };
