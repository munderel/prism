/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Env needed before authOptions is imported — auth.ts depends on it.
vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id');
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));
vi.stubEnv('NEXTAUTH_SECRET', 'test-secret');
vi.stubEnv('DATABASE_URL', 'postgresql://stub:stub@localhost:5432/stub');
vi.stubEnv('NODE_ENV', 'test');

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  invitationFindFirst: vi.fn(),
  invitationUpdate: vi.fn(),
  userCount: vi.fn(),
  companyAuthFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
      count: mocks.userCount,
    },
    invitation: {
      findFirst: mocks.invitationFindFirst,
      update: mocks.invitationUpdate,
    },
    companyAuthSettings: {
      findFirst: mocks.companyAuthFindFirst,
    },
  },
}));

const {
  userFindUnique,
  userUpdate,
  invitationFindFirst,
  invitationUpdate,
  userCount,
  companyAuthFindFirst,
} = mocks;

vi.mock('@/lib/crypto', () => ({
  encryptToken: (t: string) => `enc:${t}`,
  decryptToken: (t: string) => t.replace(/^enc:/, ''),
}));

// Avoid the real withSafeAdapter wrapping which touches Prisma internals.
vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: () => ({}),
}));

import { authOptions } from '@/lib/auth';

function findGoogleProvider() {
  const providers = (authOptions as any).providers as Array<any>;
  return providers.find((p) => {
    const id = p?.id ?? p?.options?.id;
    return id === 'google';
  });
}

describe('GoogleProvider config (Critical #3)', () => {
  it('allowDangerousEmailAccountLinking is false', () => {
    const google = findGoogleProvider();
    expect(google).toBeDefined();
    const flag = google.options?.allowDangerousEmailAccountLinking ?? google.allowDangerousEmailAccountLinking;
    expect(flag).toBe(false);
  });
});

describe('signIn callback — invitation-gated admission (Critical #3)', () => {
  const signInCb = authOptions.callbacks?.signIn;

  beforeEach(() => {
    userFindUnique.mockReset();
    userUpdate.mockReset();
    invitationFindFirst.mockReset();
    invitationUpdate.mockReset();
    userCount.mockReset();
    companyAuthFindFirst.mockReset();
    companyAuthFindFirst.mockResolvedValue(null);
  });

  it('returns true for credentials path (password-login)', async () => {
    const result = await signInCb!({
      user: { email: 'u@x' } as any,
      account: { provider: 'password-login', type: 'credentials' } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
  });

  it('admits existing, non-locked Google user', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: false, is2FAEnabled: false });
    const result = await signInCb!({
      user: { email: 'known@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
  });

  it('rejects existing locked-out user', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: true, is2FAEnabled: false });
    const result = await signInCb!({
      user: { email: 'locked@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(false);
  });

  it('admits brand-new user with valid invitation', async () => {
    userFindUnique.mockResolvedValue(null);
    invitationFindFirst.mockResolvedValue({ id: 'inv1' });
    const result = await signInCb!({
      user: { email: 'invited@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
    expect(userCount).not.toHaveBeenCalled(); // no admin-count bootstrap bypass
  });

  it('rejects brand-new user with no invitation (was the attack path)', async () => {
    userFindUnique.mockResolvedValue(null);
    invitationFindFirst.mockResolvedValue(null);
    const result = await signInCb!({
      user: { email: 'attacker@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(false);
  });

  it('rejects brand-new user even when DB has zero admins (no OAuth bootstrap bypass)', async () => {
    userFindUnique.mockResolvedValue(null);
    invitationFindFirst.mockResolvedValue(null);
    userCount.mockResolvedValue(0);
    const result = await signInCb!({
      user: { email: 'first@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(false);
    // userCount must not be queried at all — the bypass is removed.
    expect(userCount).not.toHaveBeenCalled();
  });
});

describe('signIn callback — OAuth 2FA gate (Vuln 2)', () => {
  const signInCb = authOptions.callbacks?.signIn;

  beforeEach(() => {
    userFindUnique.mockReset();
    invitationFindFirst.mockReset();
    companyAuthFindFirst.mockReset();
    companyAuthFindFirst.mockResolvedValue(null);
  });

  it('redirects to /login with oauth_2fa_required when the user has 2FA enabled', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: false, is2FAEnabled: true });
    const result = await signInCb!({
      user: { email: 'totp@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe('/login?error=oauth_2fa_required');
    expect(companyAuthFindFirst).not.toHaveBeenCalled(); // user-level gate short-circuits
  });

  it('redirects to /login with oauth_2fa_setup_required when the company enforces 2FA', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: false, is2FAEnabled: false });
    companyAuthFindFirst.mockResolvedValue({ enforce2FA: true });
    const result = await signInCb!({
      user: { email: 'no-totp@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe('/login?error=oauth_2fa_setup_required');
  });

  it('admits the user when neither user nor company requires 2FA', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: false, is2FAEnabled: false });
    companyAuthFindFirst.mockResolvedValue({ enforce2FA: false });
    const result = await signInCb!({
      user: { email: 'free@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
  });
});

describe('events.signIn — invitation TTL (Vuln 3)', () => {
  const signInEvent = authOptions.events?.signIn;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    invitationFindFirst.mockReset();
    invitationUpdate.mockReset();
    userUpdate.mockReset();
  });

  it('does not promote when the matching admin invitation is older than INVITE_EXPIRY_MS', async () => {
    // The lookup itself filters by createdAt; simulate "no fresh invite found"
    // and verify no admin promotion happens.
    invitationFindFirst.mockResolvedValue(null);

    await signInEvent!({
      user: { id: 'u1', email: 'stale@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
      isNewUser: false,
    });

    // The findFirst call must include the createdAt TTL guard.
    expect(invitationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'stale@x.com',
          status: 'PENDING',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
    const args = invitationFindFirst.mock.calls[0][0] as any;
    const cutoff: Date = args.where.createdAt.gte;
    // Cutoff should be approximately INVITE_EXPIRY_MS in the past.
    const delta = Math.abs(Date.now() - SEVEN_DAYS_MS - cutoff.getTime());
    expect(delta).toBeLessThan(5_000);

    expect(userUpdate).not.toHaveBeenCalled();
    expect(invitationUpdate).not.toHaveBeenCalled();
  });

  it('still promotes and accepts when a fresh admin invitation exists', async () => {
    invitationFindFirst.mockResolvedValue({ id: 'inv-fresh', role: 'admin' });

    await signInEvent!({
      user: { id: 'u2', email: 'fresh@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
      isNewUser: true,
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { isAdmin: true },
    });
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-fresh' },
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }),
    );
  });
});
