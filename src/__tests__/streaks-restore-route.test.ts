/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    streak: { findUnique: vi.fn(), upsert: vi.fn() },
    powerdownSession: { findMany: vi.fn() },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/streaks/restore/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockStreakFindUnique = vi.mocked(prisma.streak.findUnique);
const mockStreakUpsert = vi.mocked(prisma.streak.upsert);
const mockPowerdownFindMany = vi.mocked(prisma.powerdownSession.findMany);

const authedResult = { session: { user: { id: 'u1', isAdmin: false } }, userId: 'u1' };

// Pin "now" to NY 10:00 Apr 24 EDT (UTC 14:00) so todayStamp(NY) = 2026-04-24.
const FIXED_NOW = new Date('2026-04-24T14:00:00Z');
const TZ = 'America/New_York';

/** Build a real-UTC instant that falls inside the NY-day given by `yyyy-mm-dd`. */
function nyCompletionAt(yyyyMmDd: string, hour = 21): Date {
  // NY hour 21 (= 9pm) on the given date is UTC hour 01 the next day during EDT.
  // Use a safe noon-ish UTC offset to keep the test independent of DST quirks:
  // construct as `{date}T{hour-EDT-as-UTC+4}:00:00Z`.
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  // 21:00 EDT = 01:00 UTC next day. Use a portable construction:
  return new Date(Date.UTC(y, m - 1, d, hour + 4, 0, 0));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedResult as any);
  mockUserFindUnique.mockResolvedValue({ timezone: TZ } as any);
  mockStreakFindUnique.mockResolvedValue({ bestCount: 3 } as any);
  mockStreakUpsert.mockImplementation(async (args: any) => ({
    id: 's-daily',
    streakType: 'daily',
    ...args.create,
    ...args.update,
  } as any));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/streaks/restore', () => {
  it('returns count=0 when there are no completed sessions', async () => {
    mockPowerdownFindMany.mockResolvedValue([] as any);
    const res = await POST();
    expect(res.status).toBe(200);
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.currentCount).toBe(0);
    expect(upsertArg.update.lastActiveDate).toBeNull();
    expect(upsertArg.update.isActive).toBe(true);
    expect(upsertArg.update.breakReason).toBeNull();
  });

  it('counts 5 consecutive days when each of today..today-4 has a completion', async () => {
    mockPowerdownFindMany.mockResolvedValue([
      { completedAt: nyCompletionAt('2026-04-24') },
      { completedAt: nyCompletionAt('2026-04-23') },
      { completedAt: nyCompletionAt('2026-04-22') },
      { completedAt: nyCompletionAt('2026-04-21') },
      { completedAt: nyCompletionAt('2026-04-20') },
    ] as any);
    await POST();
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.currentCount).toBe(5);
    expect(upsertArg.update.isActive).toBe(true);
  });

  it('stops at the first gap (5 days with a gap on day-3 yields 3)', async () => {
    mockPowerdownFindMany.mockResolvedValue([
      { completedAt: nyCompletionAt('2026-04-24') },
      { completedAt: nyCompletionAt('2026-04-23') },
      { completedAt: nyCompletionAt('2026-04-22') },
      // 2026-04-21 missing — gap
      { completedAt: nyCompletionAt('2026-04-20') },
    ] as any);
    await POST();
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.currentCount).toBe(3);
  });

  it('counts back from yesterday when today has no completion yet', async () => {
    mockPowerdownFindMany.mockResolvedValue([
      // No 2026-04-24 (today not done yet)
      { completedAt: nyCompletionAt('2026-04-23') },
      { completedAt: nyCompletionAt('2026-04-22') },
    ] as any);
    await POST();
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.currentCount).toBe(2);
    // lastActiveDate must be yesterday's NY midnight (real UTC).
    expect(upsertArg.update.lastActiveDate).toBeInstanceOf(Date);
  });

  it('keeps prior bestCount when the restored count is lower', async () => {
    mockStreakFindUnique.mockResolvedValue({ bestCount: 50 } as any);
    mockPowerdownFindMany.mockResolvedValue([
      { completedAt: nyCompletionAt('2026-04-24') },
      { completedAt: nyCompletionAt('2026-04-23') },
    ] as any);
    await POST();
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.bestCount).toBe(50);
  });

  it('raises bestCount when the restored count is higher', async () => {
    mockStreakFindUnique.mockResolvedValue({ bestCount: 1 } as any);
    mockPowerdownFindMany.mockResolvedValue([
      { completedAt: nyCompletionAt('2026-04-24') },
      { completedAt: nyCompletionAt('2026-04-23') },
      { completedAt: nyCompletionAt('2026-04-22') },
    ] as any);
    await POST();
    const upsertArg = mockStreakUpsert.mock.calls[0][0] as any;
    expect(upsertArg.update.bestCount).toBe(3);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await POST();
    expect(res.status).toBe(401);
  });
});
