/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// auth-guard pulls in next-auth + authOptions; mock those transitively so the
// REAL requireCronSecret (pure crypto) still runs and we exercise the actual
// Bearer-secret gate.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: { count: vi.fn() },
    account: { count: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/health/route';

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockUserCount = vi.mocked(prisma.user.count);
const mockAccountCount = vi.mocked(prisma.account.count);

const SECRET = 'test-cron-secret';
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function healthRequest(headers?: Record<string, string>) {
  return new Request('http://localhost/api/health', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});

describe('GET /api/health (anonymous)', () => {
  it('returns only ok and dbStatus when the DB is reachable', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }] as any);
    const res = await GET(healthRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['dbStatus', 'ok']);
    expect(body.ok).toBe(true);
    expect(body.dbStatus).toBe('connected');
    // No counts are computed for anonymous callers.
    expect(mockUserCount).not.toHaveBeenCalled();
    expect(mockAccountCount).not.toHaveBeenCalled();
  });

  it('returns dbStatus error WITHOUT the raw error message when the DB is down', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connect ECONNREFUSED db.internal:5432'));
    const res = await GET(healthRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['dbStatus', 'ok']);
    expect(body.dbStatus).toBe('error');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('treats a wrong bearer token as anonymous', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }] as any);
    const res = await GET(healthRequest({ authorization: 'Bearer wrong-secret' }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['dbStatus', 'ok']);
  });
});

describe('GET /api/health (Bearer CRON_SECRET)', () => {
  it('returns the verbose diagnostic payload', async () => {
    mockUserCount.mockResolvedValue(7 as any);
    mockAccountCount.mockResolvedValue(3 as any);
    const res = await GET(healthRequest({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dbStatus).toBe('connected');
    expect(body.userCount).toBe(7);
    expect(body.accountCount).toBe(3);
    expect(body).toHaveProperty('dbUrlSet');
    expect(body).toHaveProperty('nextAuthUrl');
    expect(body).toHaveProperty('tokenKeySet');
  });

  it('includes dbError detail for operators when the DB is down', async () => {
    mockUserCount.mockRejectedValue(new Error('connection refused'));
    const res = await GET(healthRequest({ authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.dbStatus).toBe('error');
    expect(body.dbError).toContain('connection refused');
  });
});
