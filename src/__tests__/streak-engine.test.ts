/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    publicWin: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { updateSpecificStreak, updateDailyStreak } from '@/lib/streak-engine';

const mockFindUnique = vi.mocked(prisma.streak.findUnique);
const mockCreate = vi.mocked(prisma.streak.create);
const mockUpdate = vi.mocked(prisma.streak.update);
const mockPublicWinCreate = vi.mocked(prisma.publicWin.create);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);

function makeStreak(overrides: Record<string, any> = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    id: 's1',
    userId: 'u1',
    streakType: 'test',
    currentCount: 3,
    bestCount: 5,
    lastActiveDate: yesterday,
    isActive: true,
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({} as any);
  mockUpdate.mockResolvedValue({} as any);
  mockPublicWinCreate.mockResolvedValue({} as any);
});

describe('updateSpecificStreak', () => {
  it('creates a new streak with count 1 on first call', async () => {
    mockFindUnique.mockResolvedValue(null);
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', streakType: 'aim_cat1', currentCount: 1, bestCount: 1 }),
      })
    );
  });

  it('skips update when already updated today', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    mockFindUnique.mockResolvedValue(makeStreak({ lastActiveDate: today }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('increments streak when last active yesterday', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 3, bestCount: 5, lastActiveDate: daysAgo(1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 4, bestCount: 5 }),
      })
    );
  });

  it('resets streak to 1 when gap exceeds windowDays (default 1)', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 10, bestCount: 10, lastActiveDate: daysAgo(2) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 1, bestCount: 10 }),
      })
    );
  });

  it('skips update when streak isActive is false', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ isActive: false, lastActiveDate: daysAgo(1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uses cadence-aware window for WEEKLY process (9 days)', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 2, bestCount: 2, lastActiveDate: daysAgo(8) }));
    await updateSpecificStreak('u1', 'process_abc', 'WEEKLY');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 3 }),
      })
    );
  });

  it('resets process streak when gap exceeds cadence window', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 5, bestCount: 8, lastActiveDate: daysAgo(10) }));
    await updateSpecificStreak('u1', 'process_abc', 'WEEKLY');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 1, bestCount: 8 }),
      })
    );
  });

  it('creates publicWin at milestone 7', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 6, bestCount: 6, lastActiveDate: daysAgo(1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockPublicWinCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', message: expect.stringContaining('7') }),
      })
    );
  });

  it('does not create publicWin for non-milestone count', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 4, bestCount: 4, lastActiveDate: daysAgo(1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockPublicWinCreate).not.toHaveBeenCalled();
  });
});

describe('updateDailyStreak', () => {
  it('updates the daily streak when category is enabled', async () => {
    mockUserFindUnique.mockResolvedValue({
      streakCountAims: true,
      streakCountProcesses: true,
      streakCountReviews: true,
      streakCountPowerdown: true,
    } as any);
    mockFindUnique.mockResolvedValue(null);
    await updateDailyStreak('u1', 'aims');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ streakType: 'daily' }),
      })
    );
  });

  it('skips update when category is disabled', async () => {
    mockUserFindUnique.mockResolvedValue({
      streakCountAims: false,
      streakCountProcesses: true,
      streakCountReviews: true,
      streakCountPowerdown: true,
    } as any);
    await updateDailyStreak('u1', 'aims');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns silently when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(updateDailyStreak('u1', 'aims')).resolves.toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
