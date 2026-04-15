/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/streak-engine', () => ({
  upsertOrUpdateStreak: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { upsertOrUpdateStreak } from '@/lib/streak-engine';
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/streaks/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockUpsertOrUpdateStreak = vi.mocked(upsertOrUpdateStreak);
const mockStreakFindMany = vi.mocked(prisma.streak.findMany);
const mockStreakFindUnique = vi.mocked(prisma.streak.findUnique);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function yesterday() {
  const d = today();
  d.setDate(d.getDate() - 1);
  return d;
}

function createGetRequest(type?: string) {
  const url = type
    ? `http://localhost/api/streaks?type=${type}`
    : 'http://localhost/api/streaks';
  return { nextUrl: new URL(url) } as any;
}

function createPostRequest(body: object = { streakType: 'daily' }) {
  return new Request('http://localhost/api/streaks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('GET /api/streaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns user streaks', async () => {
    const streaks = [{ id: 's1', streakType: 'daily', currentCount: 5 }];
    mockStreakFindMany.mockResolvedValue(streaks as any);
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('filters by type=process prefix', async () => {
    mockStreakFindMany.mockResolvedValue([] as any);
    await GET(createGetRequest('process'));
    expect(mockStreakFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          streakType: { startsWith: 'process_' },
        }),
      })
    );
  });

  it('filters by type=aim prefix', async () => {
    mockStreakFindMany.mockResolvedValue([] as any);
    await GET(createGetRequest('aim'));
    expect(mockStreakFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          streakType: { startsWith: 'aim_' },
        }),
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/streaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
    mockUpsertOrUpdateStreak.mockResolvedValue({});
  });

  it('returns 400 when streakType is missing', async () => {
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('streakType is required');
  });

  it('delegates to upsertOrUpdateStreak with windowDays=1', async () => {
    const streak = { id: 's1', currentCount: 1, bestCount: 1, isActive: true };
    mockStreakFindUnique.mockResolvedValue(streak as any);
    await POST(createPostRequest());
    expect(mockUpsertOrUpdateStreak).toHaveBeenCalledWith('user1', 'daily', 1);
  });

  it('returns the current streak after engine update', async () => {
    const streak = { id: 's1', streakType: 'daily', currentCount: 6, bestCount: 6, lastActiveDate: today(), isActive: true };
    mockStreakFindUnique.mockResolvedValue(streak as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentCount).toBe(6);
  });

  it('does not increment a paused streak (isActive=false)', async () => {
    // The engine respects isActive — this test verifies the route delegates to it.
    const pausedStreak = { id: 's1', streakType: 'daily', currentCount: 5, bestCount: 5, lastActiveDate: yesterday(), isActive: false };
    mockStreakFindUnique.mockResolvedValue(pausedStreak as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(200);
    // Engine was called (it decides whether to update based on isActive)
    expect(mockUpsertOrUpdateStreak).toHaveBeenCalledTimes(1);
    // The returned streak still shows the pre-pause count
    const body = await res.json();
    expect(body.currentCount).toBe(5);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await POST(createPostRequest());
    expect(res.status).toBe(401);
  });
});
