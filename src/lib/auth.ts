import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';

// Dev-only credentials provider — passwordless email login for local development.
// Gated behind NODE_ENV to prevent accidental exposure in production.
const devProvider =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_LOGIN === 'true'
    ? [
        CredentialsProvider({
          name: 'Dev Login',
          credentials: {
            email: { label: 'Email', type: 'email', placeholder: 'admin@upwhiten.com' },
          },
          async authorize(credentials) {
            if (!credentials?.email) return null;
            const normalizedEmail = credentials.email.trim().toLowerCase();
            const user = await prisma.user.findUnique({
              where: { email: normalizedEmail },
            });
            if (!user) return null;
            return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  // PrismaAdapter is kept for Google OAuth account linking and DB user management.
  // With JWT strategy, sessions are stored in the token, not the DB Session table.
  adapter: PrismaAdapter(prisma),
  providers: [
    ...devProvider,
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
    async jwt({ token, user }) {
      // On initial sign-in, set user ID in token
      if (user) {
        token.id = user.id;
      }

      // Re-fetch isAdmin from DB on every request to catch role changes promptly.
      // Tradeoff: adds one small SELECT per authenticated request. If request volume
      // grows, consider short-TTL caching (e.g., 60s) or reducing JWT maxAge instead.
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isAdmin: true },
        });
        token.isAdmin = dbUser?.isAdmin ?? false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isAdmin = token.isAdmin ?? false;
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
      if (account?.provider === 'google') {
        const userCount = await prisma.user.count();
        if (userCount <= 1) {
          await prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: true },
          });
        }
      }

      // Check for pending invitation and apply role
      if (account?.provider === 'google' && user.email) {
        const invitation = await prisma.invitation.findFirst({
          where: {
            email: user.email.toLowerCase(),
            status: 'PENDING',
          },
        });

        if (invitation) {
          await prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: invitation.role === 'admin' },
          });

          await prisma.invitation.update({
            where: { id: invitation.id },
            data: {
              status: 'ACCEPTED',
              acceptedAt: new Date(),
            },
          });
        }
      }

      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
};
