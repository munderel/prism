/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requireAdmin, requireOwnership, requireCronSecret } from '@/lib/auth-guard';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { getServerSession } from 'next-auth';
const mockGetServerSession = vi.mocked(getServerSession);

describe('requireAuth', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const result = await requireAuth();
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });

  it('returns session when authenticated', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAuth();
    expect(result.session).toEqual(session);
    expect(result.userId).toBe('user1');
  });
});

describe('requireAdmin', () => {
  it('returns 403 when not admin', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAdmin();
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('returns session when admin', async () => {
    const session = { user: { id: 'admin1', isAdmin: true } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireAdmin();
    expect(result.session).toEqual(session);
    expect(result.userId).toBe('admin1');
  });
});

describe('requireOwnership', () => {
  it('returns 403 when ownerId does not match', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user2');
    expect(result.error).toBe('Forbidden');
    expect(result.status).toBe(403);
  });

  it('allows admin to access any resource', async () => {
    const session = { user: { id: 'admin1', isAdmin: true } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user2');
    expect(result.session).toEqual(session);
  });

  it('allows owner to access own resource', async () => {
    const session = { user: { id: 'user1', isAdmin: false } };
    mockGetServerSession.mockResolvedValue(session as any);
    const result = await requireOwnership('user1');
    expect(result.session).toEqual(session);
  });
});

// Mock the environment variable
vi.stubEnv('CRON_SECRET', 'test-cron-secret');

describe('requireCronSecret', () => {
  it('returns true for valid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(requireCronSecret(request)).toBe(true);
  });

  it('returns false for invalid cron secret', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for missing authorization header', () => {
    const request = new Request('http://localhost/api/cron/test');
    expect(requireCronSecret(request)).toBe(false);
  });

  it('returns false for mismatched length', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer x' },
    });
    expect(requireCronSecret(request)).toBe(false);
  });
});
