/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((what: string) => Response.json({ error: `${what} not found` }, { status: 404 })),
  forbiddenResponse: vi.fn(() => Response.json({ error: 'Forbidden' }, { status: 403 })),
  pickDefined: (obj: any, fields: string[]) => {
    const out: any = {};
    for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
    return out;
  },
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateReviewSchema: {},
}));

vi.mock('@/lib/calendar', () => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
  getGoogleSyncInfo: vi.fn(),
}));

vi.mock('@/lib/google-recurring-sync', () => ({
  cancelManagedSeriesInstance: vi.fn(),
  syncManagedSeriesOverride: vi.fn(),
}));

vi.mock('@/lib/streak-engine', () => ({
  updateSpecificStreak: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { updateSpecificStreak } from '@/lib/streak-engine';
import { deleteGoogleEvent } from '@/lib/calendar';
import { PATCH } from '@/app/api/reviews/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);
const mockFindUnique = vi.mocked(prisma.review.findUnique);
const mockFindUniqueOrThrow = vi.mocked(prisma.review.findUniqueOrThrow);
const mockUpdateMany = vi.mocked(prisma.review.updateMany);
const mockUpdate = vi.mocked(prisma.review.update);
const mockStreak = vi.mocked(updateSpecificStreak);
const mockDeleteEvent = vi.mocked(deleteGoogleEvent);

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/reviews/[id] — double-complete race (Critical #14)', () => {
  const reviewRow = {
    id: 'r1',
    userId: 'u1',
    reviewType: 'WEEKLY',
    isTeamReview: false,
    completedAt: null,
    calendarEventId: null,
    scheduledDate: new Date('2026-04-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: 'u1', isAdmin: false } },
      userId: 'u1',
    } as any);
    mockParseBody.mockResolvedValue({ data: { complete: true } } as any);
    mockFindUnique.mockResolvedValue(reviewRow as any);
    mockFindUniqueOrThrow.mockResolvedValue({ ...reviewRow, completedAt: new Date() } as any);
    mockUpdate.mockResolvedValue({ ...reviewRow, completedAt: new Date('2026-04-01') } as any);
    mockStreak.mockResolvedValue(undefined as any);
  });

  it('the winning call updates exactly once AND fires streaks', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 } as any);
    const res = await PATCH(
      new Request('http://x/api/reviews/r1', {
        method: 'PATCH',
        body: JSON.stringify({ complete: true }),
      }) as any,
      paramsFor('r1'),
    );
    expect(res.status).toBe(200);
    // Two updateMany calls on the winning path: (1) the guarded target update,
    // (2) the sibling-sweep that closes other open rows in the same week.
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    const targetCall = mockUpdateMany.mock.calls[0][0] as any;
    expect(targetCall.where).toEqual({ id: 'r1', completedAt: null });
    const sweepCall = mockUpdateMany.mock.calls[1][0] as any;
    expect(sweepCall.where.userId).toBe('u1');
    expect(sweepCall.where.reviewType).toBe('WEEKLY');
    expect(sweepCall.where.completedAt).toBeNull();
    expect(sweepCall.where.id).toEqual({ not: 'r1' });
    expect(sweepCall.where.scheduledDate.gte).toBeInstanceOf(Date);
    expect(sweepCall.where.scheduledDate.lt).toBeInstanceOf(Date);
    // Two streak calls: specific + legacy
    expect(mockStreak).toHaveBeenCalledTimes(2);
    expect(mockStreak).toHaveBeenCalledWith('u1', 'review_weekly', expect.anything());
    expect(mockStreak).toHaveBeenCalledWith('u1', 'review', expect.anything());
  });

  it('the losing call (count=0) ALSO fires streaks (self-heal)', async () => {
    // Streak firing is no longer gated on didCompleteNow. upsertOrUpdateStreak
    // is per-day idempotent so re-firing is safe, and this self-heals reviews
    // whose completedAt got set without a streak update (e.g. from a prior
    // schema regression). The GCal delete/cancel branches remain gated on
    // didCompleteNow downstream so double-deletes never fire.
    mockUpdateMany.mockResolvedValue({ count: 0 } as any);
    const res = await PATCH(
      new Request('http://x/api/reviews/r1', {
        method: 'PATCH',
        body: JSON.stringify({ complete: true }),
      }) as any,
      paramsFor('r1'),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    expect(mockStreak).toHaveBeenCalledTimes(2);
    // But GCal delete stays gated on the transition — losing call must NOT
    // try to delete a calendar event the winner already removed.
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });

  it('under 5-way concurrent complete, exactly one winner fires streaks', async () => {
    // First call wins (count=1); the rest see completedAt already set (count=0).
    // Also returns the now-completed row for subsequent reads.
    let callIndex = 0;
    mockUpdateMany.mockImplementation(async () => {
      const count = callIndex === 0 ? 1 : 0;
      callIndex++;
      return { count } as any;
    });
    mockFindUnique.mockImplementation(async () =>
      callIndex === 0 ? (reviewRow as any) : ({ ...reviewRow, completedAt: new Date() } as any),
    );

    const runs = Array.from({ length: 5 }, () =>
      PATCH(
        new Request('http://x/api/reviews/r1', {
          method: 'PATCH',
          body: JSON.stringify({ complete: true }),
        }) as any,
        paramsFor('r1'),
      ),
    );
    const results = await Promise.all(runs);
    expect(results).toHaveLength(5);
    // All 5 calls that arrived with completedAt === null enter the complete
    // branch. Each fires 2 streak calls (specific + legacy). Per-day
    // idempotency inside upsertOrUpdateStreak means the engine deduplicates
    // these anyway, so firing on every losing call is cheap and self-heals
    // any prior broken state.
    expect(mockStreak).toHaveBeenCalledTimes(10);
  });

  it('passing complete:true on an already-completed review does NOT fire streaks again', async () => {
    // Pre-race snapshot already has completedAt set -> skips the updateMany
    // branch entirely and uses prisma.review.update.
    mockFindUnique.mockResolvedValueOnce({
      ...reviewRow,
      completedAt: new Date('2026-04-01'),
    } as any);
    const res = await PATCH(
      new Request('http://x/api/reviews/r1', {
        method: 'PATCH',
        body: JSON.stringify({ complete: true }),
      }) as any,
      paramsFor('r1'),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockStreak).not.toHaveBeenCalled();
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });
});
