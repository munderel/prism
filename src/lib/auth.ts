import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          access_type: 'offline',
          prompt: 'consent',
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.isAdmin = (user as unknown as { isAdmin: boolean }).isAdmin ?? false;
      }
      return session;
    },
    async signIn({ account, user }) {
      // Store Google refresh token on sign in
      if (account?.provider === 'google' && account.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            googleRefreshToken: account.refresh_token,
            googleTokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
          },
        });
      }

      // Auto-promote first user to admin
      const userCount = await prisma.user.count();
      if (userCount <= 1) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: true },
        });
      }

      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'database',
  },
};
