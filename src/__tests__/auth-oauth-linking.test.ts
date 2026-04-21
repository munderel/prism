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
  invitationFindFirst: vi.fn(),
  userCount: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      count: mocks.userCount,
    },
    invitation: {
      findFirst: mocks.invitationFindFirst,
    },
  },
}));

const { userFindUnique, invitationFindFirst, userCount } = mocks;

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
    invitationFindFirst.mockReset();
    userCount.mockReset();
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
    userFindUnique.mockResolvedValue({ isLockedOut: false });
    const result = await signInCb!({
      user: { email: 'known@x.com' } as any,
      account: { provider: 'google' } as any,
      profile: {} as any,
    });
    expect(result).toBe(true);
  });

  it('rejects existing locked-out user', async () => {
    userFindUnique.mockResolvedValue({ isLockedOut: true });
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
