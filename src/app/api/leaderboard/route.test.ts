import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((result) => Response.json({ error: result.error }, { status: result.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    aimInstance: {
      findMany: vi.fn(),
    },
    processExecution: {
      findMany: vi.fn(),
    },
    powerdownSession: {
      findMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
    publicWin: {
      findMany: vi.fn(),
    },
  },
}));

import { GET } from './route';
import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

const mockRequireAuth = vi.mocked(requireAuth);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockAimInstanceFindMany = vi.mocked(prisma.aimInstance.findMany);
const mockProcessExecutionFindMany = vi.mocked(prisma.processExecution.findMany);
const mockPowerdownSessionFindMany = vi.mocked(prisma.powerdownSession.findMany);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockReviewFindMany = vi.mocked(prisma.review.findMany);
const mockPublicWinFindMany = vi.mocked(prisma.publicWin.findMany);

describe('GET /api/leaderboard', () => {
  it('returns only public users ranked by computed score', async () => {
    const now = new Date();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: 'viewer-1', isAdmin: false } } as any,
      userId: 'viewer-1',
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Sarah',
        image: null,
        leaderboardResetAt: null,
        streaks: [{ streakType: 'daily', currentCount: 3, bestCount: 6 }],
      },
      {
        id: 'user-2',
        name: 'James',
        image: null,
        leaderboardResetAt: null,
        streaks: [{ streakType: 'daily', currentCount: 1, bestCount: 4 }],
      },
    ] as any);
    // Counts are aggregated in app code from raw completion rows; the route
    // windows by each user's leaderboardResetAt (null = no reset, include all).
    // Aims must clear the 60-minute effort gate to score (actualMinutes >= 60).
    mockAimInstanceFindMany.mockResolvedValue([
      { userId: 'user-1', completedAt: now, pointsEarned: 5, actualMinutes: 90, timeBlockStart: null, timeBlockEnd: null, aimCategory: { defaultDurationMin: 90 } },
      { userId: 'user-1', completedAt: now, pointsEarned: 3, actualMinutes: 90, timeBlockStart: null, timeBlockEnd: null, aimCategory: { defaultDurationMin: 90 } },
    ] as any);
    mockTaskFindMany.mockResolvedValue([
      ...Array(10).fill({ ownerId: 'user-1', completedAt: now }),
      ...Array(20).fill({ ownerId: 'user-2', completedAt: now }),
    ] as any);
    mockReviewFindMany.mockResolvedValue([
      ...Array(2).fill({ userId: 'user-1', completedAt: now }),
      ...Array(1).fill({ userId: 'user-2', completedAt: now }),
    ] as any);
    mockProcessExecutionFindMany.mockResolvedValue([] as any);
    mockPowerdownSessionFindMany.mockResolvedValue([] as any);
    mockPublicWinFindMany.mockResolvedValue([] as any);

    const response = await GET(new Request('http://localhost/api/leaderboard') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublicOnLeaderboard: true },
      })
    );
    // New scoring (Issue 10):
    //   user-1: streak 3*10 + reviews 2*5 + tasks 10*3 + aimScore 8 = 78
    //   user-2: streak 1*10 + reviews 1*5 + tasks 20*3            = 75
    expect(body.leaderboard).toHaveLength(2);
    expect(body.leaderboard[0]).toMatchObject({
      id: 'user-1',
      score: 78,
      aimsCompleted: 2,
      aimScore: 8,
    });
    expect(body.leaderboard[1]).toMatchObject({
      id: 'user-2',
      score: 75,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);

    const response = await GET(new Request('http://localhost/api/leaderboard') as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  // Critical #17 — leaderboard must bound every findMany to avoid OOM at
  // scale. These assertions pin the bounds so a future refactor can't
  // silently drop them.
  describe('bounded fetch (Critical #17)', () => {
    beforeEachBound();

    it('caps public-user lookup to MAX_PUBLIC_USERS (1000)', async () => {
      await GET(new Request('http://localhost/api/leaderboard') as any);
      const call = mockUserFindMany.mock.calls[0][0] as any;
      expect(call.take).toBe(1000);
    });

    it('scopes every per-table findMany to { in: publicUserIds }', async () => {
      await GET(new Request('http://localhost/api/leaderboard') as any);
      for (const mock of [
        mockAimInstanceFindMany,
        mockProcessExecutionFindMany,
        mockPowerdownSessionFindMany,
        mockTaskFindMany,
        mockReviewFindMany,
      ]) {
        const where = (mock.mock.calls[0][0] as any).where;
        const userIdKey = ['userId', 'ownerId', 'executedById'].find((k) => k in where);
        expect(userIdKey).toBeDefined();
        expect(where[userIdKey!]).toEqual({ in: expect.any(Array) });
      }
    });

    it('caps each per-table findMany to MAX_ROWS_PER_TABLE (50 000)', async () => {
      await GET(new Request('http://localhost/api/leaderboard') as any);
      for (const mock of [
        mockAimInstanceFindMany,
        mockProcessExecutionFindMany,
        mockPowerdownSessionFindMany,
        mockTaskFindMany,
        mockReviewFindMany,
      ]) {
        expect((mock.mock.calls[0][0] as any).take).toBe(50_000);
      }
    });

    it('output leaderboard is sliced to top 100', async () => {
      // 150 users — only 100 should appear in output.
      const many = Array.from({ length: 150 }, (_, i) => ({
        id: `u${i}`,
        name: `User ${i}`,
        image: null,
        leaderboardResetAt: null,
        streaks: [{ currentCount: 150 - i, bestCount: 150 - i }],
      }));
      mockUserFindMany.mockResolvedValue(many as any);
      const res = await GET(new Request('http://localhost/api/leaderboard') as any);
      const body = await res.json();
      expect(body.leaderboard).toHaveLength(100);
    });
  });
});

function beforeEachBound() {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: 'viewer', isAdmin: false } } as any,
      userId: 'viewer',
    });
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', name: 'a', image: null, leaderboardResetAt: null, streaks: [] },
    ] as any);
    mockAimInstanceFindMany.mockResolvedValue([] as any);
    mockProcessExecutionFindMany.mockResolvedValue([] as any);
    mockPowerdownSessionFindMany.mockResolvedValue([] as any);
    mockTaskFindMany.mockResolvedValue([] as any);
    mockReviewFindMany.mockResolvedValue([] as any);
    mockPublicWinFindMany.mockResolvedValue([] as any);
  });
}
