import { prisma } from '@/lib/prisma';
import { toUserDayStamp, dstSafeDate, shiftDayStamp } from '@/lib/user-timezone';
import { computeDailyStreak, computeWeeklyStreak } from '@/lib/aim-streak-engine';

export interface StreakHistoryRow {
  completedAt: Date;
}

export interface RecomputeOptions {
  tz: string;
  graceDays: boolean;
  /** UTC instant treated as "now" for window-staleness checks. Defaults to new Date(). */
  asOf?: Date;
  /** Continuation window in days. Defaults to 1 (matches the daily/powerdown rule). */
  continuationWindowDays?: number;
}

export interface RecomputeResult {
  currentCount: number;
  bestCount: number;
  /** UTC instant for midnight (in tz) of the last day a powerdown was credited, or null. */
  lastActiveDate: Date | null;
  /** The YYYY-MM-DD stamp of the last credited day in the user's tz. null if no history. */
  lastStamp: string | null;
  /**
   * True when the streak should be marked "broken" because the most recent
   * completion is outside the continuation window. `currentCount` will be 0
   * but `bestCount` is preserved.
   */
  brokenForStaleness: boolean;
}

/**
 * Pure function: walks a user's powerdown completion history and returns the
 * canonical streak state. Idempotent — running this twice on the same input
 * returns identical output. Used both by the admin recompute endpoint and the
 * unit tests.
 */
export function recomputeStreakFromHistory(
  history: StreakHistoryRow[],
  opts: RecomputeOptions,
): RecomputeResult {
  const { tz, graceDays } = opts;
  const asOf = opts.asOf ?? new Date();
  const continuationWindowDays = opts.continuationWindowDays ?? 1;
  const effectiveWindow = continuationWindowDays + (graceDays ? 1 : 0);

  const sorted = [...history]
    .filter((row) => row.completedAt != null)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  let currentCount = 0;
  let bestCount = 0;
  let lastStamp: string | null = null;

  for (const row of sorted) {
    const stamp = toUserDayStamp(row.completedAt, tz);
    if (stamp === lastStamp) continue; // per-day idempotent

    if (lastStamp == null) {
      currentCount = 1;
    } else {
      const gap = daysBetweenStamps(lastStamp, stamp);
      currentCount = gap <= effectiveWindow ? currentCount + 1 : 1;
    }
    if (currentCount > bestCount) bestCount = currentCount;
    lastStamp = stamp;
  }

  if (lastStamp == null) {
    return { currentCount: 0, bestCount: 0, lastActiveDate: null, lastStamp: null, brokenForStaleness: false };
  }

  // Has the streak gone stale relative to "now"? If the gap from lastStamp to
  // today exceeds the window, currentCount drops to 0 (best preserved).
  const todayStamp = toUserDayStamp(asOf, tz);
  const stalenessGap = daysBetweenStamps(lastStamp, todayStamp);
  const brokenForStaleness = stalenessGap > effectiveWindow;

  return {
    currentCount: brokenForStaleness ? 0 : currentCount,
    bestCount,
    lastActiveDate: dstSafeDate(lastStamp, tz),
    lastStamp,
    brokenForStaleness,
  };
}

/**
 * Calendar-day distance between two YYYY-MM-DD stamps, computed in UTC so
 * the result is unaffected by DST in either direction.
 */
function daysBetweenStamps(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/** Stamp helper kept here so callers don't have to also import user-timezone. */
export { shiftDayStamp };

export interface UserRecomputeReport {
  userId: string;
  tz: string;
  graceDays: boolean;
  before: { daily: StreakSnapshot | null; powerdown: StreakSnapshot | null };
  computed: RecomputeResult;
  applied: boolean;
}

export interface StreakSnapshot {
  currentCount: number;
  bestCount: number;
  lastActiveDate: Date | null;
}

/**
 * Loads a user's powerdown completion history, recomputes the canonical daily
 * + powerdown streak state, and (unless dryRun) writes the result to both
 * Streak rows. Returns a diff report for telemetry / staging spot-checks.
 */
export async function recomputeUserStreaks(
  userId: string,
  opts: { dryRun?: boolean; asOf?: Date } = {},
): Promise<UserRecomputeReport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, streakGraceDays: true },
  });
  if (!user) throw new Error(`user not found: ${userId}`);

  const tz = user.timezone ?? 'America/New_York';
  const graceDays = user.streakGraceDays ?? false;

  const history = await prisma.powerdownSession.findMany({
    where: { userId, completedAt: { not: null } },
    select: { completedAt: true },
    orderBy: { completedAt: 'asc' },
  });

  const computed = recomputeStreakFromHistory(
    history.filter((h): h is { completedAt: Date } => h.completedAt != null),
    { tz, graceDays, asOf: opts.asOf },
  );

  const [beforeDaily, beforePowerdown] = await Promise.all([
    loadSnapshot(userId, 'daily'),
    loadSnapshot(userId, 'powerdown'),
  ]);

  if (opts.dryRun) {
    return {
      userId,
      tz,
      graceDays,
      before: { daily: beforeDaily, powerdown: beforePowerdown },
      computed,
      applied: false,
    };
  }

  // Write both streak types from the same computed result. PowerdownSession
  // is the source of truth for `currentCount` and `lastActiveDate`. For
  // `bestCount` we take the max of the existing row and the recomputed
  // value — recompute never *lowers* a user's historical best, since
  // PowerdownSession history can be incomplete (e.g. a session could have
  // been deleted) and a personal best is something the user shouldn't
  // silently lose to a recovery script.
  const baseData = {
    currentCount: computed.currentCount,
    lastActiveDate: computed.lastActiveDate,
    breakReason: computed.brokenForStaleness ? 'recomputed: outside continuation window' : null,
  };
  const dailyData = { ...baseData, bestCount: Math.max(beforeDaily?.bestCount ?? 0, computed.bestCount) };
  const powerdownData = { ...baseData, bestCount: Math.max(beforePowerdown?.bestCount ?? 0, computed.bestCount) };

  await prisma.$transaction([
    prisma.streak.upsert({
      where: { userId_streakType: { userId, streakType: 'daily' } },
      create: { userId, streakType: 'daily', ...dailyData },
      update: dailyData,
    }),
    prisma.streak.upsert({
      where: { userId_streakType: { userId, streakType: 'powerdown' } },
      create: { userId, streakType: 'powerdown', ...powerdownData },
      update: powerdownData,
    }),
  ]);

  return {
    userId,
    tz,
    graceDays,
    before: { daily: beforeDaily, powerdown: beforePowerdown },
    computed,
    applied: true,
  };
}

async function loadSnapshot(userId: string, streakType: string): Promise<StreakSnapshot | null> {
  const row = await prisma.streak.findUnique({
    where: { userId_streakType: { userId, streakType } },
    select: { currentCount: true, bestCount: true, lastActiveDate: true },
  });
  return row ?? null;
}

// ---------------------------------------------------------------------------
// AIM streak recompute
// ---------------------------------------------------------------------------

export interface AimStreakReport {
  userAimId: string;
  aimCategoryId: string;
  isDaily: boolean;
  before: { currentStreak: number; bestStreak: number };
  after: { currentStreak: number };
  applied: boolean;
}

/**
 * Recomputes `currentStreak` for every active UserAim belonging to a user
 * using the new daily-vs-weekly logic.
 *
 * `bestStreak` is preserved (never lowered) — only `currentStreak` is updated.
 * Safe to run multiple times (idempotent).
 */
export async function recomputeAimStreaks(
  userId: string,
  opts: { dryRun?: boolean; asOf?: Date } = {},
): Promise<AimStreakReport[]> {
  const userAims = await prisma.userAim.findMany({
    where: { userId, isActive: true },
    include: { aimCategory: true },
  });

  const reports: AimStreakReport[] = [];

  for (const ua of userAims) {
    const instances = await prisma.aimInstance.findMany({
      where: { userId, aimCategoryId: ua.aimCategoryId },
      select: { scheduledDate: true, completedAt: true },
    });

    let newStreak: number;

    if (ua.aimCategory.isDaily) {
      const result = computeDailyStreak(instances, ua.activeWeekdays, opts.asOf);
      newStreak = result.currentStreak;
    } else {
      const weeklyTarget = ua.customFrequency ?? ua.aimCategory.defaultFrequency;
      const result = computeWeeklyStreak(instances, weeklyTarget, opts.asOf);
      newStreak = result.currentStreak;
    }

    const report: AimStreakReport = {
      userAimId: ua.id,
      aimCategoryId: ua.aimCategoryId,
      isDaily: ua.aimCategory.isDaily,
      before: { currentStreak: ua.currentStreak, bestStreak: ua.bestStreak },
      after: { currentStreak: newStreak },
      applied: false,
    };

    if (!opts.dryRun) {
      await prisma.userAim.update({
        where: { id: ua.id },
        data: {
          currentStreak: newStreak,
          bestStreak: Math.max(ua.bestStreak, newStreak),
        },
      });
      report.applied = true;
    }

    reports.push(report);
  }

  return reports;
}
