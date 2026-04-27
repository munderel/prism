/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      updateMany: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/streaks/reset/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockUpdateMany = vi.mocked(prisma.streak.updateMany);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedResult as any);
  mockUpdateMany.mockResolvedValue({ count: 0 } as any);
});

describe('POST /api/streaks/reset', () => {
  it('zeros the count and clears lastActiveDate but does NOT pause the engine', async () => {
    const req = new Request('http://localhost/api/streaks/reset', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mockUpdateMany.mock.calls[0][0] as any;
    expect(arg.data.currentCount).toBe(0);
    expect(arg.data.lastActiveDate).toBeNull();
    expect(arg.data.breakReason).toBe('Manual reset');
    // Critical: previous bug was setting isActive=false here, which silently
    // no-op'd every future PowerDown completion. Reset must leave isActive alone.
    expect(arg.data).not.toHaveProperty('isActive');
  });

  it('zeros bestCount when ?includeBest=true', async () => {
    const req = new Request('http://localhost/api/streaks/reset?includeBest=true', { method: 'POST' });
    await POST(req);
    const arg = mockUpdateMany.mock.calls[0][0] as any;
    expect(arg.data.bestCount).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const req = new Request('http://localhost/api/streaks/reset', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
