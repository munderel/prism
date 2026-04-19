import { ProcessCadence } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { maybePostBeeminder, BeeminderResult } from '@/lib/beeminder';

/**
 * Returns midnight today in the given IANA timezone.
 *
 * INVARIANT: The returned Date has a UTC epoch shifted to represent the
 * user's local time. This means it should ONLY be compared against other
 * dates produced by this function or stored via the same path (lastActiveDate).
 * Comparing against raw `new Date()` or `completedAt` timestamps will give
 * incorrect day-boundary results.
 */
function startOfUserToday(timezone: string): Date {
  const zoned = toZonedTime(new Date(), timezone);
  zoned.setHours(0, 0, 0, 0);
  return zoned;
}

interface StreakUserSettings {
  timezone: string;
  graceDays: boolean;
}

/** Fetches streak-relevant user settings, with safe defaults. */
async function getStreakUserSettings(userId: string): Promise<StreakUserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, streakGraceDays: true },
  });
  return {
    timezone: user?.timezone ?? 'America/New_York',
    graceDays: user?.streakGraceDays ?? false,
  };
}

export const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);

// Base continuation windows (no grace). Each value is the number of days
// within which the last activity must fall to continue the streak.
// When streakGraceDays is enabled, 1 day is added to each.
const CONTINUATION_WINDOW_DAYS: Record<ProcessCadence, number> = {
  ONE_TIME: 0,
  DAILY: 1,      // must be active yesterday
  WEEKLY: 7,     // within 1 week
  BIWEEKLY: 14,  // within 2 weeks
  MONTHLY: 31,   // within ~1 month
  QUARTERLY: 91, // within ~3 months
  YEARLY: 366,   // within 1 year (accounts for leap years)
};

/**
 * Daily-streak trigger categories. A day now "counts" when EITHER the user
 * completes Power Down OR all of their active daily aims are completed.
 */
export type StreakCategory = 'powerdown' | 'daily_aims_complete';

export interface StreakUpdateResult {
  beeminder?: BeeminderResult;
}

export async function upsertOrUpdateStreak(
  userId: string,
  streakType: string,
  windowDays: number,
  settings?: StreakUserSettings,
): Promise<StreakUpdateResult> {
  const { timezone, graceDays } = settings ?? await getStreakUserSettings(userId);
  const today = startOfUserToday(timezone);
  const effectiveWindow = windowDays + (graceDays ? 1 : 0);

  let existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId, streakType } },
  });

  if (!existing) {
    try {
      await prisma.streak.create({
        data: { userId, streakType, currentCount: 1, bestCount: 1, lastActiveDate: today },
      });
    } catch (e: unknown) {
      // P2002 = unique constraint violation: a concurrent request created it first.
      // Re-fetch and fall through to normal update logic.
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      existing = await prisma.streak.findUnique({
        where: { userId_streakType: { userId, streakType } },
      });
      if (!existing) throw e;
      // Fall through to the read-modify-write below.
    }
    if (!existing) {
      // Successfully created — first-ever completion.
      if (streakType === 'daily') {
        return { beeminder: await maybePostBeeminder(userId) };
      }
      return {};
    }
  }

  if (!existing.isActive) return {};

  const lastActive = existing.lastActiveDate;
  if (lastActive && lastActive >= today) return {}; // idempotent same-day

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - effectiveWindow);
  const isContinuation = lastActive != null && lastActive >= windowStart;
  const newCount = isContinuation ? existing.currentCount + 1 : 1;

  await prisma.streak.update({
    where: { id: existing.id },
    data: {
      currentCount: newCount,
      bestCount: Math.max(existing.bestCount, newCount),
      lastActiveDate: today,
      breakReason: null, // clear previous break reason on any update
    },
  });

  if (STREAK_MILESTONES.has(newCount)) {
    await prisma.publicWin.create({
      data: { userId, message: `${newCount}-period ${streakType} streak!` },
    });
  }

  if (streakType === 'daily') {
    return { beeminder: await maybePostBeeminder(userId) };
  }
  return {};
}

/**
 * Break a streak for a given user, resetting the count to 0 and storing the reason.
 */
export async function breakStreak(
  userId: string,
  streakType: string,
  reason: string,
): Promise<void> {
  await prisma.streak.upsert({
    where: { userId_streakType: { userId, streakType } },
    update: {
      currentCount: 0,
      breakReason: reason,
    },
    create: {
      userId,
      streakType,
      currentCount: 0,
      bestCount: 0,
      breakReason: reason,
    },
  });
}

/**
 * Check whether the user missed yesterday's powerdown and break the daily streak if so.
 * Called nightly by the derailing cron job.
 *
 * Per the simplified rule: the daily streak depends only on powerdown completion.
 * Missed AIMs / processes / reviews break their OWN per-item streaks (handled
 * separately when those items go overdue) but do not derail the daily streak.
 */
export async function checkAndBreakMissedStreaks(userId: string): Promise<string[]> {
  const reasons: string[] = [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streakGraceDays: true, timezone: true },
  });
  if (!user) return reasons;

  const today = startOfUserToday(user.timezone);
  // When grace is enabled, look back 2 days instead of 1 before breaking
  const lookbackDays = user.streakGraceDays ? 2 : 1;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  // Did the user complete a powerdown anywhere from cutoff to today (exclusive)?
  const recentPowerdown = await prisma.powerdownSession.findFirst({
    where: {
      userId,
      completedAt: { not: null, gte: cutoff, lt: today },
    },
    select: { id: true },
  });
  if (!recentPowerdown) {
    const reason = `Missed powerdown for ${cutoff.toISOString().slice(0, 10)}`;
    await breakStreak(userId, 'daily', reason);
    reasons.push(reason);
  }

  return reasons;
}

/**
 * Update a specific named streak (aim_<id>, process_<id>, review, powerdown, daily).
 * Uses cadence-aware continuation window for process streaks (pass cadence),
 * daily window (1 day) for all others.
 * Respects the isActive flag — does nothing if the streak is paused.
 */
export async function updateSpecificStreak(
  userId: string,
  streakType: string,
  cadence?: ProcessCadence,
): Promise<void> {
  const windowDays = cadence ? CONTINUATION_WINDOW_DAYS[cadence] : 1;
  await upsertOrUpdateStreak(userId, streakType, windowDays);
  // Return value intentionally discarded — Beeminder only fires for 'daily'
}

/**
 * Update the master 'daily' streak. Per the simplified rule, this fires only
 * for powerdown completions; non-powerdown callers are no-ops kept for
 * back-compat so existing code doesn't crash before being cleaned up.
 *
 * Respects isActive on the existing 'daily' streak record (via upsertOrUpdateStreak).
 */
export async function updateDailyStreak(
  userId: string,
  category: StreakCategory,
): Promise<StreakUpdateResult> {
  if (category !== 'powerdown' && category !== 'daily_aims_complete') return {};
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, streakGraceDays: true },
  });
  if (!user) return {};
  return upsertOrUpdateStreak(userId, 'daily', 1, {
    timezone: user.timezone,
    graceDays: user.streakGraceDays,
  });
}

/**
 * If the user has just completed every active daily UserAim for today, tick
 * the daily streak. Safe to call after every AimInstance completion — the
 * underlying upsert is idempotent per-day via `lastActiveDate`.
 */
export async function maybeIncrementDailyStreakIfDayComplete(
  userId: string,
): Promise<StreakUpdateResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? 'America/New_York';
  const dayStart = startOfUserToday(timezone);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const activeDailyAims = await prisma.userAim.findMany({
    where: { userId, isActive: true, aimCategory: { isDaily: true } },
    select: { aimCategoryId: true },
  });
  if (activeDailyAims.length === 0) return {};

  const completedCategoryIds = await prisma.aimInstance.findMany({
    where: {
      userId,
      status: 'COMPLETED',
      aimCategoryId: { in: activeDailyAims.map((a) => a.aimCategoryId) },
      scheduledDate: { gte: dayStart, lt: dayEnd },
    },
    select: { aimCategoryId: true },
    distinct: ['aimCategoryId'],
  });

  if (completedCategoryIds.length < activeDailyAims.length) return {};

  return updateDailyStreak(userId, 'daily_aims_complete');
}
