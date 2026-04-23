import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { encryptToken } from './crypto';
import { prisma } from './prisma';
import { INVITE_EXPIRY_MS } from './api-helpers';
import { checkLockout, recordLoginAttempt } from './login-lockout';

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
  const originalLinkAccount = adapter.linkAccount!;
  return {
    ...adapter,
    linkAccount: (account: Record<string, unknown>) => {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(account)) {
        if (ACCOUNT_FIELDS.has(key)) cleaned[key] = value;
      }
      return originalLinkAccount(cleaned as Parameters<typeof originalLinkAccount>[0]);
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
    const isDev = process.env.NODE_ENV === 'development';
    try {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }

      const normalizedEmail = credentials.email.trim().toLowerCase();
      if (isDev) console.log('[auth] authorize — attempt for:', normalizedEmail);

      // Lockout check BEFORE password work. checkLockout auto-clears
      // expired locks so a user naturally recovers after the window.
      const lockoutStatus = await checkLockout(prisma, normalizedEmail);
      if (lockoutStatus.locked) {
        // Record the attempt so the attacker's timeline stays visible, but
        // don't extend the lock — they're already capped until `until`.
        await recordLoginAttempt(prisma, { email: normalizedEmail, success: false });
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      // Bootstrap admin now goes through scripts/bootstrap-admin.ts (env-driven,
      // race-safe, idempotent). Removing the credential-path auto-admin closes
      // Critical #2 and H#8: two concurrent POSTs can no longer both become
      // admin, and an unauthenticated request cannot create one at all.
      if (!user || !user.passwordHash) {
        await recordLoginAttempt(prisma, { email: normalizedEmail, success: false });
        return null;
      }

      const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!isValid) {
        await recordLoginAttempt(prisma, { email: normalizedEmail, success: false });
        return null;
      }

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
      try {
        const companyAuth = await prisma.companyAuthSettings.findFirst();
        if (companyAuth?.enforce2FA && !user.is2FAEnabled) {
          throw new Error('2FA_SETUP_REQUIRED');
        }
      } catch (e) {
        if (e instanceof Error && e.message === '2FA_SETUP_REQUIRED') throw e;
        console.error('[auth] authorize — failed to check company auth:', e instanceof Error ? e.message : e);
      }

      // Record success only after all auth steps pass. Writing success on
      // a 2FA_REQUIRED throw would prematurely clear the failure tally.
      await recordLoginAttempt(prisma, { email: normalizedEmail, success: true });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
      };
    } catch (error) {
      // Re-throw 2FA signals so NextAuth can pass them to the client.
      // An INVALID_2FA_CODE is still a failed attempt for lockout purposes.
      if (error instanceof Error && error.message === 'INVALID_2FA_CODE') {
        await recordLoginAttempt(prisma, {
          email: credentials?.email?.trim().toLowerCase() ?? '',
          success: false,
        }).catch(() => {});
        throw error;
      }
      if (error instanceof Error && ['2FA_REQUIRED', '2FA_SETUP_REQUIRED'].includes(error.message)) {
        throw error;
      }
      console.error('[auth] authorize — unexpected error:', error instanceof Error ? error.message : error);
      return null;
    }
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
      // Critical #3: keep this OFF. When true, NextAuth silently links a
      // fresh Google sign-in to ANY existing Prism user whose email matches
      // the Google profile email. That let an attacker sign in with Google
      // as a victim's email and receive a valid session for the victim's
      // password account. The events.signIn remediation below fires AFTER
      // the JWT is minted, so the attacker's session is already live.
      allowDangerousEmailAccountLinking: false,

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
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.adminCheckedAt = Date.now();
      }

      // Re-fetch isAdmin and lockout status from DB every 5 minutes
      const ADMIN_CACHE_TTL = 5 * 60 * 1000;
      if (
        token.id &&
        (!token.adminCheckedAt ||
          Date.now() - (token.adminCheckedAt as number) > ADMIN_CACHE_TTL)
      ) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, isAdmin: true, isLockedOut: true },
        });
        if (dbUser?.isLockedOut) {
          // Invalidate the session for locked out users
          return { ...token, isLockedOut: true };
        }
        token.name = dbUser?.name ?? token.name;
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
        session.user.name = token.name as string | undefined;
        session.user.isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
    async signIn({ account, user }) {
      const isDev = process.env.NODE_ENV === 'development';
      try {
        if (
          account?.provider === 'password-login' ||
          account?.provider === 'dev-login' ||
          account?.type === 'credentials'
        ) {
          return true;
        }

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

        // First-admin bootstrap no longer happens through OAuth — see
        // scripts/bootstrap-admin.ts (Critical #2). No existing account,
        // no valid invitation -> block sign-in.
        if (isDev) console.log('[auth] signIn — blocked, no invite for:', normalizedEmail);
        return false;
      } catch (error) {
        console.error('[auth] signIn callback error:', error instanceof Error ? error.message : error);
        throw new Error('SignInCallbackError');
      }
    },
  },
  events: {
    // Write operations run here instead of in callbacks.signIn because
    // events.signIn fires AFTER the PrismaAdapter creates the user,
    // so user.id is always a valid DB record ID.
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return;

      try {
        // The cross-user account-linking remediation that used to live here
        // only triggered AFTER the JWT was minted, so an attacker already had
        // a valid session by the time it ran. Critical #3 fixes the root
        // cause by setting allowDangerousEmailAccountLinking=false above;
        // this block can no longer be reached.

        // Store Google refresh token (encrypted if key is available, plaintext fallback)
        if (account.refresh_token) {
          if (!process.env.TOKEN_ENCRYPTION_KEY) {
            if (process.env.NODE_ENV === 'production') {
              console.error(
                '[auth] TOKEN_ENCRYPTION_KEY missing in production — refusing to persist refresh token as plaintext. User will be forced to re-authenticate.',
              );
              return;
            }
            console.warn('[auth] TOKEN_ENCRYPTION_KEY not set — storing refresh token as plaintext (dev only).');
          }
          const tokenToStore = process.env.TOKEN_ENCRYPTION_KEY
            ? encryptToken(account.refresh_token)
            : account.refresh_token;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              googleRefreshToken: tokenToStore,
              googleTokenExpiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        }

        // First-admin bootstrap moved to scripts/bootstrap-admin.ts (Critical
        // #2). OAuth no longer auto-promotes anyone.

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
      } catch (error) {
        // Log but don't throw — failing here should not block login
        console.error('[auth] events.signIn error (non-fatal):', error instanceof Error ? error.message : error);
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
  debug: process.env.NODE_ENV === 'development',
  logger: {
    error(code: string, metadata: unknown) {
      console.error(`[nextauth][error] ${code}:`, JSON.stringify(metadata, null, 2));
    },
    warn(code: string) {
      console.warn(`[nextauth][warn] ${code}`);
    },
    debug(code: string, metadata: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[nextauth][debug] ${code}:`, JSON.stringify(metadata, null, 2));
      }
    },
  },
};
