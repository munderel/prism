/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
  checkStackReadAccess: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    goal: { findUnique: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));

import { requireAuth, checkStackReadAccess } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/goals/[id]/activity/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckRead = vi.mocked(checkStackReadAccess);
const mockGoalFind = vi.mocked(prisma.goal.findUnique);
const mockTaskFind = vi.mocked(prisma.task.findMany);

const ownerAuth = {
  session: { user: { id: 'u-owner', isAdmin: false } },
  userId: 'u-owner',
} as any;

const goalRow = {
  id: 'g1',
  deletedAt: null,
  stack: { id: 's1', isCompany: false, ownerId: 'u-owner' },
};

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(qs = '') {
  return new Request(`http://x/api/goals/g1/activity${qs}`) as any;
}

describe('GET /api/goals/[id]/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    const res = await GET(makeReq(), paramsFor('g1'));
    expect(res.status).toBe(401);
    expect(mockGoalFind).not.toHaveBeenCalled();
  });

  it('returns 404 when goal does not exist', async () => {
    mockRequireAuth.mockResolvedValue(ownerAuth);
    mockGoalFind.mockResolvedValue(null as any);
    const res = await GET(makeReq(), paramsFor('g1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when goal is soft-deleted', async () => {
    mockRequireAuth.mockResolvedValue(ownerAuth);
    mockGoalFind.mockResolvedValue({ ...goalRow, deletedAt: new Date() } as any);
    const res = await GET(makeReq(), paramsFor('g1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when stack access is denied', async () => {
    mockRequireAuth.mockResolvedValue(ownerAuth);
    mockGoalFind.mockResolvedValue(goalRow as any);
    mockCheckRead.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    );
    const res = await GET(makeReq(), paramsFor('g1'));
    expect(res.status).toBe(403);
    expect(mockTaskFind).not.toHaveBeenCalled();
  });

  it('returns an array of { date, count } across the requested range, zero-filled', async () => {
    mockRequireAuth.mockResolvedValue(ownerAuth);
    mockGoalFind.mockResolvedValue(goalRow as any);
    mockCheckRead.mockResolvedValue(null);
    // Two completions on different days
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    mockTaskFind.mockResolvedValue([
      { completedAt: today },
      { completedAt: today },
      { completedAt: yesterday },
    ] as any);

    const res = await GET(makeReq('?days=7'), paramsFor('g1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; count: number }[];
    // Zero-filled over the 7-day window
    expect(body).toHaveLength(7);
    const total = body.reduce((sum, e) => sum + e.count, 0);
    expect(total).toBe(3);
    // Newest day is last
    expect(body[body.length - 1].count).toBe(2);
    expect(body[body.length - 2].count).toBe(1);
  });

  it('clamps days to [1, 365]', async () => {
    mockRequireAuth.mockResolvedValue(ownerAuth);
    mockGoalFind.mockResolvedValue(goalRow as any);
    mockCheckRead.mockResolvedValue(null);
    mockTaskFind.mockResolvedValue([]);

    const huge = await GET(makeReq('?days=9999'), paramsFor('g1'));
    const hugeBody = (await huge.json()) as unknown[];
    expect(hugeBody).toHaveLength(365);

    const zero = await GET(makeReq('?days=0'), paramsFor('g1'));
    const zeroBody = (await zero.json()) as unknown[];
    expect(zeroBody).toHaveLength(1);
  });
});
