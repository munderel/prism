/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findUnique: vi.fn() },
    reviewAnswer: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  createReviewAnswerSchema: {},
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((e: string) => Response.json({ error: `${e} not found` }, { status: 404 })),
}));

import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/reviews/[id]/answers/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);
const mockReviewFindUnique = vi.mocked(prisma.review.findUnique);
const mockAnswerUpsert = vi.mocked(prisma.reviewAnswer.upsert);

const authed = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };
const params = Promise.resolve({ id: 'review-1' });

describe('POST /api/reviews/[id]/answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authed as any);
    mockReviewFindUnique.mockResolvedValue({ id: 'review-1', userId: 'user1', isTeamReview: false } as any);
    mockParseBody.mockResolvedValue({
      data: { stepKey: 'goals_reviewed', answerType: 'text', answerData: { text: 'x' } },
    } as any);
  });

  it('uses upsert so concurrent POSTs converge to a single row', async () => {
    mockAnswerUpsert.mockResolvedValue({ id: 'ans-1' } as any);

    const req = new Request('http://localhost/api/reviews/review-1/answers', { method: 'POST' }) as any;

    // Fire two concurrent POSTs for the same (reviewId, stepKey).
    const [r1, r2] = await Promise.all([POST(req, { params }), POST(req, { params })]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mockAnswerUpsert).toHaveBeenCalledTimes(2);
    // Both calls target the same composite unique key.
    for (const call of mockAnswerUpsert.mock.calls) {
      expect(call[0].where).toEqual({
        reviewId_stepKey: { reviewId: 'review-1', stepKey: 'goals_reviewed' },
      });
    }
  });

  it('returns 404 when the review does not belong to the user', async () => {
    mockReviewFindUnique.mockResolvedValue({ id: 'review-1', userId: 'otherUser', isTeamReview: false } as any);
    const req = new Request('http://localhost/api/reviews/review-1/answers', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect(mockAnswerUpsert).not.toHaveBeenCalled();
  });

  it('IDOR guard: a TEAM review owned by another user is not writable by a non-admin', async () => {
    // Team-review rows are per-user with private answers. Previously the
    // `!isTeamReview &&` short-circuit let any authed user write here.
    mockReviewFindUnique.mockResolvedValue({ id: 'review-1', userId: 'otherUser', isTeamReview: true } as any);
    const req = new Request('http://localhost/api/reviews/review-1/answers', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect(mockAnswerUpsert).not.toHaveBeenCalled();
  });

  it('admin may write answers on another user team review (rollups)', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' } as any);
    mockReviewFindUnique.mockResolvedValue({ id: 'review-1', userId: 'otherUser', isTeamReview: true } as any);
    mockAnswerUpsert.mockResolvedValue({ id: 'ans-1' } as any);
    const req = new Request('http://localhost/api/reviews/review-1/answers', { method: 'POST' }) as any;
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    expect(mockAnswerUpsert).toHaveBeenCalledTimes(1);
  });
});
