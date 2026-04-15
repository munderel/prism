import { ProcessCadence } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { maybePostBeeminder, BeeminderResult } from '@/lib/beeminder';

/** Returns midnight today in the given IANA timezone. */
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

export type StreakCategory = 'aims' | 'processes' | 'reviews' | 'powerdown';

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
 * Check due items for a user and break streaks for anything missed.
 * Called nightly by the derailing cron job.
 */
export async function checkAndBreakMissedStreaks(userId: string): Promise<string[]> {
  const reasons: string[] = [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      streakCountAims: true,
      streakCountProcesses: true,
      streakCountReviews: true,
      streakCountPowerdown: true,
      timezone: true,
    },
  });
  if (!user) return reasons;

  const today = startOfUserToday(user.timezone);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check AIMs: find aim instances that were due yesterday and not completed
  if (user.streakCountAims) {
    const missedAims = await prisma.aimInstance.findMany({
      where: {
        userId,
        scheduledDate: { gte: yesterday, lt: today },
        status: { not: 'COMPLETED' },
      },
      include: { aimCategory: { select: { name: true } } },
    });
    for (const aim of missedAims) {
      const reason = `Missed AIM '${aim.aimCategory?.name ?? 'Unknown'}' due ${yesterday.toISOString().slice(0, 10)}`;
      await breakStreak(userId, 'daily', reason);
      reasons.push(reason);
      break; // One break is enough for the daily streak
    }
  }

  // Check Processes: find process tasks due yesterday that are not done
  if (user.streakCountProcesses) {
    const missedProcessTasks = await prisma.task.findMany({
      where: {
        ownerId: userId,
        processId: { not: null },
        dueDate: { gte: yesterday, lt: today },
        status: { notIn: ['DONE', 'DROPPED'] },
      },
      include: { processExecution: { include: { process: { select: { title: true } } } } },
      take: 1,
    });
    for (const task of missedProcessTasks) {
      const processName = task.processExecution?.process?.title ?? 'Unknown process';
      const reason = `Missed process '${processName}' due ${yesterday.toISOString().slice(0, 10)}`;
      if (reasons.length === 0) {
        await breakStreak(userId, 'daily', reason);
      }
      reasons.push(reason);
      break;
    }
  }

  // Check Reviews: find overdue reviews
  if (user.streakCountReviews) {
    const overdueReviews = await prisma.review.findMany({
      where: {
        userId,
        scheduledDate: { lt: today },
        completedAt: null,
      },
      take: 1,
    });
    for (const review of overdueReviews) {
      const reason = `Overdue ${review.reviewType} review scheduled ${review.scheduledDate.toISOString().slice(0, 10)}`;
      if (reasons.length === 0) {
        await breakStreak(userId, 'daily', reason);
      }
      reasons.push(reason);
      break;
    }
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
 * Update the master 'daily' streak if the user has the given category enabled.
 * Reads user.streakCount<Category> — skips entirely if that flag is false.
 * Also respects the isActive flag on the existing 'daily' streak record (via upsertOrUpdateStreak).
 */
export async function updateDailyStreak(
  userId: string,
  category: StreakCategory,
): Promise<StreakUpdateResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      streakGraceDays: true,
      streakCountAims: true,
      streakCountProcesses: true,
      streakCountReviews: true,
      streakCountPowerdown: true,
    },
  });
  if (!user) return {};

  const enabled: Record<StreakCategory, boolean> = {
    aims: user.streakCountAims,
    processes: user.streakCountProcesses,
    reviews: user.streakCountReviews,
    powerdown: user.streakCountPowerdown,
  };

  if (!enabled[category]) return {};
  return upsertOrUpdateStreak(userId, 'daily', 1, {
    timezone: user.timezone,
    graceDays: user.streakGraceDays,
  });
}
