/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dayBoundariesForUser } from '@/lib/user-timezone';

vi.mock('@/lib/beeminder', () => ({
  maybePostBeeminder: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streak: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    publicWin: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    powerdownSession: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { updateSpecificStreak, updateDailyStreak, checkAndBreakMissedStreaks } from '@/lib/streak-engine';

const mockFindUnique = vi.mocked(prisma.streak.findUnique);
const mockCreate = vi.mocked(prisma.streak.create);
const mockUpdate = vi.mocked(prisma.streak.update);
const mockUpsert = vi.mocked(prisma.streak.upsert);
const mockPublicWinCreate = vi.mocked(prisma.publicWin.create);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockPowerdownFindFirst = vi.mocked(prisma.powerdownSession.findFirst);

// Pin the clock to NY 06:00 Apr 24 EDT (= UTC 10:00 Apr 24). This is "early
// morning the day after a late-evening powerdown" — exactly when the cron
// evaluates whether the previous calendar day was missed. Late-evening NY
// completions have completedAt timestamps in (UTC Apr 24 00:00, UTC Apr 24 04:00],
// which the old fake-UTC window incorrectly excluded.
const FIXED_NOW = new Date('2026-04-24T10:00:00Z');
const TZ = 'America/New_York';

/** Real-UTC instant of NY midnight for a date `n` days offset from FIXED_NOW. */
function dayStart(n: number): Date {
  const shifted = new Date(FIXED_NOW.getTime() + n * 86400000);
  return dayBoundariesForUser(shifted, TZ).start;
}

function makeStreak(overrides: Record<string, any> = {}) {
  return {
    id: 's1',
    userId: 'u1',
    streakType: 'test',
    currentCount: 3,
    bestCount: 5,
    lastActiveDate: dayStart(-1), // yesterday-NY midnight, real UTC
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({} as any);
  mockUpdate.mockResolvedValue({} as any);
  mockUpsert.mockResolvedValue({} as any);
  mockPublicWinCreate.mockResolvedValue({} as any);
  mockPowerdownFindFirst.mockResolvedValue(null);
  mockUserFindUnique.mockResolvedValue({
    timezone: TZ,
    streakGraceDays: false,
  } as any);
});

afterEach(() => {
  vi.useRealTimers();
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
    mockFindUnique.mockResolvedValue(makeStreak({ lastActiveDate: dayStart(0) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('increments streak when last active yesterday', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 3, bestCount: 5, lastActiveDate: dayStart(-1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 4, bestCount: 5 }),
      })
    );
  });

  it('resets streak to 1 when gap exceeds windowDays (default 1)', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 10, bestCount: 10, lastActiveDate: dayStart(-2) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 1, bestCount: 10 }),
      })
    );
  });

  it('skips update when streak isActive is false', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ isActive: false, lastActiveDate: dayStart(-1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uses cadence-aware window for WEEKLY process (7 days)', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 2, bestCount: 2, lastActiveDate: dayStart(-6) }));
    await updateSpecificStreak('u1', 'process_abc', 'WEEKLY');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 3 }),
      })
    );
  });

  it('resets process streak when gap exceeds cadence window', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 5, bestCount: 8, lastActiveDate: dayStart(-8) }));
    await updateSpecificStreak('u1', 'process_abc', 'WEEKLY');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 1, bestCount: 8 }),
      })
    );
  });

  it('creates publicWin at milestone 7', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 6, bestCount: 6, lastActiveDate: dayStart(-1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockPublicWinCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', message: expect.stringContaining('7') }),
      })
    );
  });

  it('does not create publicWin for non-milestone count', async () => {
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 4, bestCount: 4, lastActiveDate: dayStart(-1) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockPublicWinCreate).not.toHaveBeenCalled();
  });

  it('continues streak with grace day enabled when gap is 2 days', async () => {
    mockUserFindUnique.mockResolvedValue({
      timezone: TZ,
      streakGraceDays: true,
    } as any);
    mockFindUnique.mockResolvedValue(makeStreak({ currentCount: 3, bestCount: 5, lastActiveDate: dayStart(-2) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentCount: 4, bestCount: 5 }),
      })
    );
  });

  it('handles P2002 race condition by re-fetching and updating', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce({ code: 'P2002' });
    mockFindUnique.mockResolvedValueOnce(makeStreak({ currentCount: 1, bestCount: 1, lastActiveDate: dayStart(0) }));
    await updateSpecificStreak('u1', 'aim_cat1');
    expect(mockUpdate).not.toHaveBeenCalled(); // same-day, no update needed
  });
});

describe('updateDailyStreak', () => {
  it('advances the daily streak on powerdown completion', async () => {
    mockFindUnique.mockResolvedValue(null);
    await updateDailyStreak('u1', 'powerdown');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ streakType: 'daily', currentCount: 1 }),
      })
    );
  });

  it('returns silently when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(updateDailyStreak('u1', 'powerdown')).resolves.toEqual({});
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // Regression: late-evening NY powerdown (real UTC 00:30 Apr 24 = NY 20:30 Apr 23)
  // must tick the daily streak to 1 and store lastActiveDate as the REAL UTC
  // instant of NY midnight — not the fake-UTC value the old code produced.
  it('ticks daily streak from 0 to 1 on a late-evening NY powerdown', async () => {
    vi.setSystemTime(new Date('2026-04-24T00:30:00Z')); // NY 20:30 Apr 23
    mockFindUnique.mockResolvedValue(null);
    await updateDailyStreak('u1', 'powerdown');

    const expectedDayStart = dayBoundariesForUser(new Date('2026-04-24T00:30:00Z'), TZ).start;
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          streakType: 'daily',
          currentCount: 1,
          lastActiveDate: expectedDayStart,
        }),
      })
    );
  });
});

describe('checkAndBreakMissedStreaks', () => {
  // Regression: the cron window MUST use real-UTC NY day boundaries. A
  // powerdown completed at NY 22:00 Apr 23 (= UTC 02:00 Apr 24) fell outside
  // the old fake-UTC `[Apr 23 00:00Z, Apr 24 00:00Z)` window and the cron
  // falsely broke the streak. With real-UTC boundaries the window is
  // `[Apr 23 04:00Z, Apr 24 04:00Z)`, which correctly contains the completion.
  it('does NOT break the daily streak when the user completed late yesterday evening NY', async () => {
    const lateCompletion = new Date('2026-04-24T02:00:00Z'); // NY 22:00 Apr 23
    mockPowerdownFindFirst.mockImplementation(async (args: any) => {
      const w = args.where.completedAt;
      if (lateCompletion >= w.gte && lateCompletion < w.lt) {
        return { id: 'pd-1' } as any;
      }
      return null;
    });

    const breaks = await checkAndBreakMissedStreaks('u1');

    expect(breaks).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('DOES break the daily streak when no powerdown was completed in the lookback window', async () => {
    mockPowerdownFindFirst.mockResolvedValue(null);

    const breaks = await checkAndBreakMissedStreaks('u1');

    expect(breaks.length).toBe(1);
    expect(breaks[0]).toMatch(/Missed powerdown/);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_streakType: { userId: 'u1', streakType: 'daily' } },
        update: expect.objectContaining({ currentCount: 0 }),
      })
    );
  });

  it('does NOT break when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const breaks = await checkAndBreakMissedStreaks('u1');
    expect(breaks).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('queries a real-UTC NY day window (verifies boundary instants)', async () => {
    await checkAndBreakMissedStreaks('u1');
    expect(mockPowerdownFindFirst).toHaveBeenCalledTimes(1);
    const arg = mockPowerdownFindFirst.mock.calls[0][0] as any;
    // today = NY midnight Apr 24 in real UTC = Apr 24 04:00Z.
    // cutoff = today - 1 day = Apr 23 04:00Z.
    expect(arg.where.completedAt.gte).toEqual(new Date('2026-04-23T04:00:00Z'));
    expect(arg.where.completedAt.lt).toEqual(new Date('2026-04-24T04:00:00Z'));
  });
});
