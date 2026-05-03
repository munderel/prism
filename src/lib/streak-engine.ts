import { ProcessCadence } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { maybePostBeeminder, BeeminderResult } from '@/lib/beeminder';
import { dayBoundariesForUser, subtractDaysInUserTz, toUserDayStamp } from '@/lib/user-timezone';

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
  paused?: boolean;
}

/**
 * Internal outcome of the transactional read-compute-write. We surface enough
 * info for the (non-transactional) post-hooks — Beeminder POST and PublicWin
 * row — to decide what to do without re-reading the streak.
 */
type StreakTxOutcome =
  | { kind: 'created' }                    // first-ever row, count=1
  | { kind: 'paused' }                     // user paused this streak
  | { kind: 'same-day' }                   // already credited today, no-op
  | { kind: 'updated'; newCount: number }; // count went from N to newCount

export async function upsertOrUpdateStreak(
  userId: string,
  streakType: string,
  windowDays: number,
  settings?: StreakUserSettings,
): Promise<StreakUpdateResult> {
  const { timezone, graceDays } = settings ?? await getStreakUserSettings(userId);
  const { start: today } = dayBoundariesForUser(new Date(), timezone);
  const effectiveWindow = windowDays + (graceDays ? 1 : 0);
  const windowStart = subtractDaysInUserTz(new Date(), timezone, effectiveWindow);

  // Critical section: read-compute-write must be atomic so two concurrent
  // submissions cannot both read count=N and both write count=N+1 (lost
  // increment). Serializable isolation forces Postgres to detect the conflict
  // and abort one with a serialization error (Prisma P2034), which we retry.
  // Side effects (Beeminder, PublicWin) run AFTER the transaction commits so
  // an external HTTP call never holds a DB connection.
  const outcome = await runWithSerializableRetry(() =>
    prisma.$transaction(
      async (tx): Promise<StreakTxOutcome> => {
        let existing = await tx.streak.findUnique({
          where: { userId_streakType: { userId, streakType } },
        });

        if (!existing) {
          try {
            await tx.streak.create({
              data: { userId, streakType, currentCount: 1, bestCount: 1, lastActiveDate: today },
            });
            return { kind: 'created' };
          } catch (e: unknown) {
            // P2002 = unique constraint violation: a concurrent request created it.
            // Re-fetch and fall through to update logic below.
            if ((e as { code?: string })?.code !== 'P2002') throw e;
            existing = await tx.streak.findUnique({
              where: { userId_streakType: { userId, streakType } },
            });
            if (!existing) throw e;
          }
        }

        if (!existing.isActive) return { kind: 'paused' };

        const lastActive = existing.lastActiveDate;
        if (lastActive && lastActive >= today) return { kind: 'same-day' };

        const isContinuation = lastActive != null && lastActive >= windowStart;
        const newCount = isContinuation ? existing.currentCount + 1 : 1;

        await tx.streak.update({
          where: { id: existing.id },
          data: {
            currentCount: newCount,
            bestCount: Math.max(existing.bestCount, newCount),
            lastActiveDate: today,
            breakReason: null,
          },
        });

        return { kind: 'updated', newCount };
      },
      { isolationLevel: 'Serializable', timeout: 8000 },
    ),
  );

  if (outcome.kind === 'paused') return { paused: true };
  if (outcome.kind === 'same-day') return {};

  // Post-commit side effects.
  if (outcome.kind === 'updated' && STREAK_MILESTONES.has(outcome.newCount)) {
    await prisma.publicWin.create({
      data: { userId, message: `${outcome.newCount}-period ${streakType} streak!` },
    });
  }

  if (streakType === 'daily') {
    return { beeminder: await maybePostBeeminder(userId) };
  }
  return {};
}

/**
 * Wraps an interactive transaction with Postgres-serialization-conflict retry.
 * Under Serializable isolation, two concurrent transactions reading the same
 * row may both commit successfully on the first try; the second to commit is
 * aborted with SQLSTATE 40001, surfaced by Prisma as P2034. Retrying on the
 * loser side resolves the conflict cleanly because the now-committed first
 * transaction's write is visible — the retry takes the `same-day` early
 * return.
 */
async function runWithSerializableRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      // P2034 (Prisma) and 40001 (raw Postgres) both indicate a serialization
      // conflict that the caller should retry.
      if (code === 'P2034' || code === '40001') {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
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

  const { start: today } = dayBoundariesForUser(new Date(), user.timezone);
  // When grace is enabled, look back 2 days instead of 1 before breaking.
  const lookbackDays = user.streakGraceDays ? 2 : 1;
  const cutoff = subtractDaysInUserTz(new Date(), user.timezone, lookbackDays);

  // Did the user complete a powerdown anywhere from cutoff to today (exclusive)?
  const recentPowerdown = await prisma.powerdownSession.findFirst({
    where: {
      userId,
      completedAt: { not: null, gte: cutoff, lt: today },
    },
    select: { id: true },
  });
  if (!recentPowerdown) {
    // Report yesterday as the missed day — that's the day the user actually
    // failed to power down. With grace=on the window is [day-before-yesterday,
    // today) but the user-facing "missed day" is still yesterday.
    const yesterday = subtractDaysInUserTz(new Date(), user.timezone, 1);
    const reason = `Missed powerdown for ${toUserDayStamp(yesterday, user.timezone)}`;
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
  const { start: dayStart, end: dayEnd } = dayBoundariesForUser(new Date(), timezone);

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
