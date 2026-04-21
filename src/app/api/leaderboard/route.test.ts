import { describe, expect, it, vi } from 'vitest';

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
        streaks: [{ currentCount: 3, bestCount: 6 }],
      },
      {
        id: 'user-2',
        name: 'James',
        image: null,
        leaderboardResetAt: null,
        streaks: [{ currentCount: 1, bestCount: 4 }],
      },
    ] as any);
    // Counts are aggregated in app code from raw completion rows; the route
    // windows by each user's leaderboardResetAt (null = no reset, include all).
    mockAimInstanceFindMany.mockResolvedValue([
      { userId: 'user-1', completedAt: now, pointsEarned: 5 },
      { userId: 'user-1', completedAt: now, pointsEarned: 3 },
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
    expect(body.leaderboard).toHaveLength(2);
    expect(body.leaderboard[0]).toMatchObject({
      id: 'user-1',
      score: 58,
      aimsCompleted: 2,
      aimScore: 8,
    });
    expect(body.leaderboard[1]).toMatchObject({
      id: 'user-2',
      score: 35,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);

    const response = await GET(new Request('http://localhost/api/leaderboard') as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});
