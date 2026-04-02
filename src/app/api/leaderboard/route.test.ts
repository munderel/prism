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
      groupBy: vi.fn(),
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
const mockAimInstanceGroupBy = vi.mocked(prisma.aimInstance.groupBy);
const mockPublicWinFindMany = vi.mocked(prisma.publicWin.findMany);

describe('GET /api/leaderboard', () => {
  it('returns only public users ranked by computed score', async () => {
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: 'viewer-1', isAdmin: false } } as any,
      userId: 'viewer-1',
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Sarah',
        image: null,
        streaks: [{ currentCount: 3, bestCount: 6 }],
        _count: { tasks: 10, reviews: 2 },
      },
      {
        id: 'user-2',
        name: 'James',
        image: null,
        streaks: [{ currentCount: 1, bestCount: 4 }],
        _count: { tasks: 20, reviews: 1 },
      },
    ] as any);
    mockAimInstanceGroupBy.mockResolvedValue([
      { userId: 'user-1', _sum: { pointsEarned: 8 }, _count: 2 },
      { userId: 'user-2', _sum: { pointsEarned: 0 }, _count: 0 },
    ] as any);
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
