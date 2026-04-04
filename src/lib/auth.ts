import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { encryptToken } from './crypto';
import { prisma } from './prisma';
import { INVITE_EXPIRY_MS } from './api-helpers';

// Fields that exist on the Prisma Account model. NextAuth spreads the raw
// OAuth token response (`...tokens`) into the data passed to linkAccount,
// which can include fields like `expires_in` that aren't in our schema.
// Prisma v7 with driver adapters rejects unknown fields, so we strip them.
const ACCOUNT_FIELDS = new Set([
  'id', 'userId', 'type', 'provider', 'providerAccountId',
  'refresh_token', 'access_token', 'expires_at',
  'token_type', 'scope', 'id_token', 'session_state',
]);

function withSafeAdapter(adapter: ReturnType<typeof PrismaAdapter>) {
  const originalLinkAccount = adapter.linkAccount;
  return {
    ...adapter,
    linkAccount: (account: Record<string, any>) => {
      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(account)) {
        if (ACCOUNT_FIELDS.has(key)) cleaned[key] = value;
      }
      return originalLinkAccount(cleaned as any);
    },
  };
}

// Dev-only credentials provider — passwordless email login for local development.
// Gated behind NODE_ENV to prevent accidental exposure in production.
const devProvider =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_LOGIN === 'true'
    ? [
        CredentialsProvider({
          id: 'dev-login',
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

// Production credentials provider — email + password with 2FA support
const passwordProvider = CredentialsProvider({
  id: 'password-login',
  name: 'Password',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
    totpCode: { label: '2FA Code', type: 'text' },
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) return null;

    const normalizedEmail = credentials.email.trim().toLowerCase();

    // Rate limiting: check recent failed attempts for this email
    const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_FAILURES_IN_WINDOW = 5;
    const LOCKOUT_THRESHOLD = 10;
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);

    const recentFailures = await prisma.loginAttempt.count({
      where: {
        email: normalizedEmail,
        success: false,
        createdAt: { gte: windowStart },
      },
    });

    if (recentFailures >= MAX_FAILURES_IN_WINDOW) {
      return null; // Too many recent failures — deny without checking password
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) return null;
    if (user.isLockedOut) return null;

    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isValid) {
      // Record failed attempt
      await prisma.loginAttempt.create({
        data: { email: normalizedEmail, success: false },
      });

      // Check for lockout: count consecutive failures since last success
      const lastSuccess = await prisma.loginAttempt.findFirst({
        where: { email: normalizedEmail, success: true },
        orderBy: { createdAt: 'desc' },
      });
      const consecutiveFailures = await prisma.loginAttempt.count({
        where: {
          email: normalizedEmail,
          success: false,
          createdAt: { gte: lastSuccess?.createdAt ?? new Date(0) },
        },
      });
      if (consecutiveFailures >= LOCKOUT_THRESHOLD) {
        await prisma.user.update({
          where: { email: normalizedEmail },
          data: { isLockedOut: true },
        });
      }

      return null;
    }

    // Record successful login
    await prisma.loginAttempt.create({
      data: { email: normalizedEmail, success: true },
    });

    // Check 2FA if enabled
    if (user.is2FAEnabled && user.totpSecret) {
      if (!credentials.totpCode) {
        // Signal to the frontend that 2FA is required
        throw new Error('2FA_REQUIRED');
      }
      const { verifySync } = await import('otplib');
      const isValidTotp = verifySync({
        token: credentials.totpCode,
        secret: user.totpSecret,
      });
      if (!isValidTotp) {
        throw new Error('INVALID_2FA_CODE');
      }
    }

    // Check if company enforces 2FA and user hasn't set it up yet
    const companyAuth = await prisma.companyAuthSettings.findFirst();
    if (companyAuth?.enforce2FA && !user.is2FAEnabled) {
      throw new Error('2FA_SETUP_REQUIRED');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    };
  },
});

export const authOptions: NextAuthOptions = {
  // PrismaAdapter is kept for Google OAuth account linking and DB user management.
  // With JWT strategy, sessions are stored in the token, not the DB Session table.
  adapter: withSafeAdapter(PrismaAdapter(prisma)),
  providers: [
    ...devProvider,
    passwordProvider,
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
      // On initial sign-in, cache user ID and isAdmin in token
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as any).isAdmin ?? false;
        token.adminCheckedAt = Date.now();
      }

      // Re-fetch isAdmin and lockout status from DB every minute
      const ADMIN_CACHE_TTL = 60 * 1000;
      if (
        token.id &&
        (!token.adminCheckedAt ||
          Date.now() - (token.adminCheckedAt as number) > ADMIN_CACHE_TTL)
      ) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isAdmin: true, isLockedOut: true },
        });
        if (dbUser?.isLockedOut) {
          // Invalidate the session for locked out users
          return { ...token, isLockedOut: true };
        }
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.adminCheckedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (token.isLockedOut) {
        // Return empty session to force re-login
        return { ...session, user: undefined };
      }
      if (session.user) {
        session.user.id = token.id;
        session.user.isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
    async signIn({ account, user }) {
      try {
        if (account?.provider === 'password-login' || account?.provider === 'dev-login') return true;

        if (!user.email) return false;

        const normalizedEmail = user.email.trim().toLowerCase();

        const dbUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { isLockedOut: true },
        });

        if (dbUser) return !dbUser.isLockedOut;

        // New user — require a valid pending invitation
        const invitation = await prisma.invitation.findFirst({
          where: {
            email: normalizedEmail,
            status: 'PENDING',
            createdAt: { gte: new Date(Date.now() - INVITE_EXPIRY_MS) },
          },
        });

        if (invitation) return true;

        // Allow the very first user (bootstrap admin)
        const userCount = await prisma.user.count();
        if (userCount <= 1) return true;

        // No existing account, no valid invitation — block sign-in
        return false;
      } catch (error: any) {
        console.error('[auth] signIn callback error:', error.message, error.stack);
        return false;
      }
    },
  },
  events: {
    // Write operations run here instead of in callbacks.signIn because
    // events.signIn fires AFTER the PrismaAdapter creates the user,
    // so user.id is always a valid DB record ID.
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return;

      try {
        // Defense-in-depth: detect cross-user account linking.
        // When an existing session cookie is present during a new Google OAuth
        // flow, NextAuth's callbackHandler links the new Google account to the
        // session user instead of creating a new user. Detect and remediate by
        // comparing the OAuth profile email with the DB user's email.
        if (
          profile?.email &&
          user.email &&
          profile.email.toLowerCase() !== user.email.toLowerCase()
        ) {
          await prisma.account.deleteMany({
            where: {
              userId: user.id,
              provider: 'google',
              providerAccountId: account.providerAccountId,
            },
          });
          console.error(
            `[auth] Security: Cross-user account linking detected and remediated. ` +
            `DB user ${user.email} had Google account for ${profile.email} incorrectly linked. Unlinked.`
          );
          return;
        }

        // Store Google refresh token (encrypted)
        if (account.refresh_token) {
          if (!process.env.TOKEN_ENCRYPTION_KEY) {
            console.warn('[auth] TOKEN_ENCRYPTION_KEY not set — skipping refresh token storage');
          } else {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                googleRefreshToken: encryptToken(account.refresh_token),
                googleTokenExpiresAt: account.expires_at
                  ? new Date(account.expires_at * 1000)
                  : null,
              },
            });
          }
        }

        // Auto-promote first user to admin
        await prisma.$transaction(async (tx) => {
          const userCount = await tx.user.count();
          if (userCount <= 1) {
            await tx.user.update({
              where: { id: user.id },
              data: { isAdmin: true },
            });
          }
        });

        // Check for pending invitation and apply role
        if (user.email) {
          const invitation = await prisma.invitation.findFirst({
            where: {
              email: user.email.toLowerCase(),
              status: 'PENDING',
            },
          });

          if (invitation) {
            if (invitation.role === 'admin') {
              await prisma.user.update({
                where: { id: user.id },
                data: { isAdmin: true },
              });
            }

            await prisma.invitation.update({
              where: { id: invitation.id },
              data: {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
              },
            });
          }
        }
      } catch (error: any) {
        // Log but don't throw — failing here should not block login
        console.error('[auth] events.signIn error (non-fatal):', error.message);
      }
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days — persistent sessions
  },
  debug: process.env.NEXTAUTH_DEBUG === 'true',
  logger: {
    error(code: string, metadata: any) {
      console.error(`[nextauth][error] ${code}:`, metadata?.message ?? metadata?.error?.message ?? '');
    },
    warn(code: string) {
      console.warn(`[nextauth][warn] ${code}`);
    },
    debug() {},
  },
};
