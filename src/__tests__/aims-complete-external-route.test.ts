/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/completion-token', () => ({
  verifyAimToken: vi.fn(),
  getBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/lib/html-response', () => ({
  htmlResponse: (body: string, _title: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } }),
}));

vi.mock('@/lib/streak-engine', () => ({
  updateSpecificStreak: vi.fn().mockResolvedValue(undefined),
  maybeIncrementDailyStreakIfDayComplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/derailing-buffer', () => ({
  applyBufferOnCompletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/aim-progress', () => ({
  recalculateUserAimProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/streak-recompute', () => ({
  recomputeAimStreaks: vi.fn().mockResolvedValue([]),
}));

import { prisma } from '@/lib/prisma';
import { verifyAimToken } from '@/lib/completion-token';
import { updateSpecificStreak, maybeIncrementDailyStreakIfDayComplete } from '@/lib/streak-engine';
import { applyBufferOnCompletion } from '@/lib/derailing-buffer';
import { recalculateUserAimProgress } from '@/lib/aim-progress';
import { GET } from '@/app/api/aims/instances/[id]/complete-external/route';

const mockFindUnique = vi.mocked(prisma.aimInstance.findUnique);
const mockUpdate = vi.mocked(prisma.aimInstance.update);
const mockVerifyToken = vi.mocked(verifyAimToken);

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/aims/instances/aim-1/complete-external');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as any;
}

describe('GET /api/aims/instances/[id]/complete-external', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyToken.mockReturnValue(true);
    mockFindUnique.mockResolvedValue({
      id: 'aim-1',
      userId: 'user-1',
      aimCategoryId: 'cat-1',
      status: 'SCHEDULED',
      aimCategory: { name: 'Deep Work' },
    } as any);
    mockUpdate.mockResolvedValue({} as any);
  });

  // Regression: this route used to mark the aim COMPLETED and walk away
  // without firing any streak / buffer / progress side-effects, so completions
  // via the email link silently diverged from in-app completions.
  it('fires per-aim streak, daily streak check, buffer, and progress recalc', async () => {
    const res = await GET(
      makeRequest({ token: 'tok', userId: 'user-1' }),
      { params: Promise.resolve({ id: 'aim-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'aim-1' },
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
    }));
    expect(vi.mocked(updateSpecificStreak)).toHaveBeenCalledWith('user-1', 'aim_cat-1');
    expect(vi.mocked(maybeIncrementDailyStreakIfDayComplete)).toHaveBeenCalledWith('user-1');
    expect(vi.mocked(applyBufferOnCompletion)).toHaveBeenCalledWith('user-1', 'cat-1');
    expect(vi.mocked(recalculateUserAimProgress)).toHaveBeenCalledWith('user-1', 'cat-1');
  });

  it('does not fire side-effects when aim is already completed', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'aim-1',
      userId: 'user-1',
      aimCategoryId: 'cat-1',
      status: 'COMPLETED',
      aimCategory: { name: 'Deep Work' },
    } as any);

    const res = await GET(
      makeRequest({ token: 'tok', userId: 'user-1' }),
      { params: Promise.resolve({ id: 'aim-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(vi.mocked(updateSpecificStreak)).not.toHaveBeenCalled();
    expect(vi.mocked(maybeIncrementDailyStreakIfDayComplete)).not.toHaveBeenCalled();
    expect(vi.mocked(applyBufferOnCompletion)).not.toHaveBeenCalled();
  });

  it('rejects invalid token with 403', async () => {
    mockVerifyToken.mockReturnValue(false);
    const res = await GET(
      makeRequest({ token: 'bad', userId: 'user-1' }),
      { params: Promise.resolve({ id: 'aim-1' }) },
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
