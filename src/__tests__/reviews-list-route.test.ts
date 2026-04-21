/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createReviewSchema: {},
  deleteReviewSchema: {},
}));

vi.mock('@/lib/review-dates', () => ({
  getNextReviewDate: vi.fn(() => new Date('2026-05-01T00:00:00Z')),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      findMany: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/reviews/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockFindMany = vi.mocked(prisma.review.findMany);

function authAs(userId: string, isAdmin: boolean) {
  return {
    session: { user: { id: userId, isAdmin } },
    userId,
  } as any;
}

describe('GET /api/reviews — cross-user scoping (Critical #5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it('non-admin: team-review branch is scoped to userId', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    await GET(new Request('http://x/api/reviews?scope=team') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    // Single branch path (scope=team), so where is that branch directly
    expect(where.isTeamReview).toBe(true);
    expect(where.userId).toBe('u-alice');
  });

  it('non-admin: default scope ORs both branches, each pinned to userId', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    await GET(new Request('http://x/api/reviews') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    // Default scope pushes two conditions ORed together
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(2);
    for (const cond of where.OR) {
      expect(cond.userId).toBe('u-alice');
    }
    const teamCond = where.OR.find((c: any) => c.isTeamReview === true);
    const indCond = where.OR.find((c: any) => c.isTeamReview === false);
    expect(teamCond).toBeDefined();
    expect(indCond).toBeDefined();
  });

  it('non-admin: individual scope is scoped to userId', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    await GET(new Request('http://x/api/reviews?scope=individual') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    expect(where.isTeamReview).toBe(false);
    expect(where.userId).toBe('u-alice');
  });

  it('admin: team branch is NOT scoped to userId (sees all team reviews)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('admin1', true));
    await GET(new Request('http://x/api/reviews?scope=team') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    expect(where.isTeamReview).toBe(true);
    expect(where.userId).toBeUndefined();
  });

  it('admin: individual branch is NOT scoped to userId (sees all users)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('admin1', true));
    await GET(new Request('http://x/api/reviews?scope=individual') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    expect(where.isTeamReview).toBe(false);
    expect(where.userId).toBeUndefined();
  });

  it('unauth returns 401', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const res = await GET(new Request('http://x/api/reviews') as any);
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('reviewType filter is applied on both branches', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    await GET(new Request('http://x/api/reviews?reviewType=WEEKLY') as any);
    const where = (mockFindMany.mock.calls[0][0] as any).where;
    for (const cond of where.OR) {
      expect(cond.reviewType).toBe('WEEKLY');
    }
  });
});
