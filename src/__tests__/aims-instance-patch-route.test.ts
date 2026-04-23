/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aimInstance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userAim: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    task: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: (a: any) => Response.json({ error: a.error }, { status: 401 }),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateAimInstanceSchema: {},
}));

vi.mock('@/lib/aim-phases', () => ({
  getPointsPerCompletion: () => 1,
  evaluatePhaseGraduation: () => null,
}));

vi.mock('@/lib/calendar', () => ({
  createGoogleEvent: vi.fn().mockResolvedValue(null),
  updateGoogleEvent: vi.fn().mockResolvedValue(undefined),
  deleteGoogleEvent: vi.fn().mockResolvedValue(undefined),
  getGoogleSyncInfo: vi.fn().mockResolvedValue({ hasGoogle: false, calendarId: null }),
}));

vi.mock('@/lib/completion-token', () => ({
  getAimCompletionUrl: () => 'http://localhost/complete',
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

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { updateSpecificStreak, maybeIncrementDailyStreakIfDayComplete } from '@/lib/streak-engine';
import { applyBufferOnCompletion } from '@/lib/derailing-buffer';
import { recalculateUserAimProgress } from '@/lib/aim-progress';
import { PATCH } from '@/app/api/aims/instances/[id]/route';

const mockFindUnique = vi.mocked(prisma.aimInstance.findUnique);
const mockUpdate = vi.mocked(prisma.aimInstance.update);
const mockUserAimFindUnique = vi.mocked(prisma.userAim.findUnique);
const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);

function makeRequest() {
  return { json: async () => ({ status: 'COMPLETED' }) } as any;
}

describe('PATCH /api/aims/instances/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      userId: 'user-1',
      session: { user: { isAdmin: false } },
    } as any);
    mockParseBody.mockResolvedValue({ data: { status: 'COMPLETED' } } as any);
    mockFindUnique.mockResolvedValue({
      id: 'aim-1',
      userId: 'user-1',
      aimCategoryId: 'cat-1',
      status: 'SCHEDULED',
      calendarEventId: null,
    } as any);
    mockUserAimFindUnique.mockResolvedValue({
      id: 'ua-1',
      currentPhase: 'SEED',
      phaseStartedAt: new Date(),
      completionCount: 0,
      aimCategory: { defaultFrequency: 7 },
    } as any);
    mockUpdate.mockResolvedValue({
      id: 'aim-1',
      status: 'COMPLETED',
      aimCategory: { name: 'Deep Work' },
      selectedActivity: null,
      timeBlockStart: null,
      timeBlockEnd: null,
    } as any);
  });

  // Regression: maybeIncrementDailyStreakIfDayComplete queries the DB for
  // COMPLETED AimInstance rows in today's window. If it runs before the
  // current instance's status write, the last daily aim of the day never
  // ticks the 'daily' streak. The fix reorders the PATCH handler so the
  // update commits first.
  it('updates aimInstance before firing daily streak check', async () => {
    await PATCH(makeRequest(), { params: Promise.resolve({ id: 'aim-1' }) });

    expect(mockUpdate).toHaveBeenCalled();
    expect(vi.mocked(maybeIncrementDailyStreakIfDayComplete)).toHaveBeenCalledWith('user-1');

    const updateOrder = mockUpdate.mock.invocationCallOrder[0];
    const dailyCheckOrder = vi.mocked(maybeIncrementDailyStreakIfDayComplete)
      .mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(dailyCheckOrder);
  });

  it('fires per-aim streak, daily streak check, buffer, and progress recalc', async () => {
    await PATCH(makeRequest(), { params: Promise.resolve({ id: 'aim-1' }) });

    expect(vi.mocked(updateSpecificStreak)).toHaveBeenCalledWith('user-1', 'aim_cat-1');
    expect(vi.mocked(maybeIncrementDailyStreakIfDayComplete)).toHaveBeenCalledWith('user-1');
    expect(vi.mocked(applyBufferOnCompletion)).toHaveBeenCalledWith('user-1', 'cat-1');
    expect(vi.mocked(recalculateUserAimProgress)).toHaveBeenCalledWith('user-1', 'cat-1');
  });

  it('does not fire streak/buffer side-effects when aim is already completed', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'aim-1',
      userId: 'user-1',
      aimCategoryId: 'cat-1',
      status: 'COMPLETED',
      calendarEventId: null,
    } as any);

    await PATCH(makeRequest(), { params: Promise.resolve({ id: 'aim-1' }) });

    expect(vi.mocked(updateSpecificStreak)).not.toHaveBeenCalled();
    expect(vi.mocked(maybeIncrementDailyStreakIfDayComplete)).not.toHaveBeenCalled();
    expect(vi.mocked(applyBufferOnCompletion)).not.toHaveBeenCalled();
  });
});
