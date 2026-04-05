/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-auth/jwt
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

// Mock next/server
const mockRedirect = vi.fn((url: URL) => ({ type: 'redirect', url }));
const mockNext = vi.fn(() => ({ type: 'next' }));
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (...args: any[]) => mockRedirect(...args),
    next: (...args: any[]) => mockNext(...args),
  },
}));

import { getToken } from 'next-auth/jwt';
import { middleware, config } from '@/middleware';

const mockGetToken = vi.mocked(getToken);

function createMockRequest(url: string) {
  return { url, nextUrl: new URL(url) } as any;
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login with callbackUrl when no token', async () => {
    mockGetToken.mockResolvedValue(null);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl: URL = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe('http://localhost:3000/dashboard');
  });

  it('preserves full URL including query params in callbackUrl', async () => {
    mockGetToken.mockResolvedValue(null);
    const request = createMockRequest('http://localhost:3000/goals?stackId=abc&level=WEEKLY');
    await middleware(request);

    const redirectUrl: URL = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.searchParams.get('callbackUrl')).toBe(
      'http://localhost:3000/goals?stackId=abc&level=WEEKLY'
    );
  });

  it('calls NextResponse.next() for valid token without lockout', async () => {
    mockGetToken.mockResolvedValue({ id: 'user1', isAdmin: false } as any);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects locked-out user to /login?error=access_revoked', async () => {
    mockGetToken.mockResolvedValue({ id: 'user1', isLockedOut: true } as any);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl: URL = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('error')).toBe('access_revoked');
  });

  it('does not include callbackUrl for locked-out redirect', async () => {
    mockGetToken.mockResolvedValue({ id: 'user1', isLockedOut: true } as any);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    const redirectUrl: URL = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.searchParams.has('callbackUrl')).toBe(false);
  });

  it('passes through when isLockedOut is false', async () => {
    mockGetToken.mockResolvedValue({ id: 'user1', isLockedOut: false } as any);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('passes through when isLockedOut is undefined', async () => {
    mockGetToken.mockResolvedValue({ id: 'user1' } as any);
    const request = createMockRequest('http://localhost:3000/dashboard');
    await middleware(request);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});

describe('middleware matcher config', () => {
  // Next.js tests the matcher against the full path — anchor the regex to match that behavior
  const matcherPattern = config.matcher[0];
  const regex = new RegExp(`^${matcherPattern}$`);

  const shouldExclude = [
    '/login',
    '/accept-invite/some-id',
    '/api/auth/callback/google',
    '/api/auth/session',
    '/api/cron/daily-check',
    '/api/health',
    '/api/invitations/invite-123',
    '/_next/static/chunks/main.js',
    '/_next/image/photo.png',
    '/favicon.ico',
  ];

  const shouldMatch = [
    '/dashboard',
    '/goals',
    '/api/tasks',
    '/api/goals',
    '/api/admin',
    '/settings',
  ];

  it.each(shouldExclude)('excludes public path: %s', (path) => {
    expect(regex.test(path)).toBe(false);
  });

  it.each(shouldMatch)('matches protected path: %s', (path) => {
    expect(regex.test(path)).toBe(true);
  });
});
