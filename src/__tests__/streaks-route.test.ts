/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  safeParseJson: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    publicWin: {
      create: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/streaks/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockStreakFindMany = vi.mocked(prisma.streak.findMany);
const mockStreakFindUnique = vi.mocked(prisma.streak.findUnique);
const mockStreakCreate = vi.mocked(prisma.streak.create);
const mockStreakUpdate = vi.mocked(prisma.streak.update);
const mockPublicWinCreate = vi.mocked(prisma.publicWin.create);

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

function twoDaysAgo() {
  const d = today();
  d.setDate(d.getDate() - 2);
  return d;
}

function createGetRequest(type?: string) {
  const url = type
    ? `http://localhost/api/streaks?type=${type}`
    : 'http://localhost/api/streaks';
  return { nextUrl: new URL(url) } as any;
}

function createPostRequest() {
  return new Request('http://localhost/api/streaks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ streakType: 'daily_completion' }),
  }) as any;
}

describe('GET /api/streaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns user streaks', async () => {
    const streaks = [{ id: 's1', streakType: 'daily_completion', currentCount: 5 }];
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
  });

  it('returns 400 when streakType is missing', async () => {
    mockSafeParseJson.mockResolvedValue({ data: {} } as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('streakType is required');
  });

  it('creates new streak with count 1', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    mockStreakFindUnique.mockResolvedValue(null);
    mockStreakCreate.mockResolvedValue({ id: 's1', currentCount: 1 } as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(201);
    expect(mockStreakCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentCount: 1,
          bestCount: 1,
        }),
      })
    );
  });

  it('returns existing streak without increment when already updated today', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    const existing = { id: 's1', currentCount: 5, bestCount: 5, lastActiveDate: today() };
    mockStreakFindUnique.mockResolvedValue(existing as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(200);
    expect(mockStreakUpdate).not.toHaveBeenCalled();
  });

  it('continues streak when last active yesterday', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    const existing = { id: 's1', currentCount: 5, bestCount: 5, lastActiveDate: yesterday() };
    mockStreakFindUnique.mockResolvedValue(existing as any);
    mockStreakUpdate.mockResolvedValue({ ...existing, currentCount: 6 } as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(200);
    expect(mockStreakUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentCount: 6,
          bestCount: 6,
        }),
      })
    );
  });

  it('resets streak to 1 when day was skipped', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    const existing = { id: 's1', currentCount: 10, bestCount: 10, lastActiveDate: twoDaysAgo() };
    mockStreakFindUnique.mockResolvedValue(existing as any);
    mockStreakUpdate.mockResolvedValue({ ...existing, currentCount: 1 } as any);
    const res = await POST(createPostRequest());
    expect(res.status).toBe(200);
    expect(mockStreakUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentCount: 1,
          bestCount: 10, // best stays at 10
        }),
      })
    );
  });

  it('creates publicWin at milestone (7-day streak)', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    const existing = { id: 's1', currentCount: 6, bestCount: 6, lastActiveDate: yesterday() };
    mockStreakFindUnique.mockResolvedValue(existing as any);
    mockStreakUpdate.mockResolvedValue({ ...existing, currentCount: 7 } as any);
    mockPublicWinCreate.mockResolvedValue({} as any);
    await POST(createPostRequest());
    expect(mockPublicWinCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user1',
          message: expect.stringContaining('7-day'),
        }),
      })
    );
  });

  it('does NOT create publicWin for non-milestone count', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { streakType: 'daily_completion' } } as any);
    const existing = { id: 's1', currentCount: 5, bestCount: 5, lastActiveDate: yesterday() };
    mockStreakFindUnique.mockResolvedValue(existing as any);
    mockStreakUpdate.mockResolvedValue({ ...existing, currentCount: 6 } as any);
    await POST(createPostRequest());
    expect(mockPublicWinCreate).not.toHaveBeenCalled();
  });
});
