import { ProcessCadence } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { startOfToday } from '@/lib/date-utils';
import { maybePostBeeminder, BeeminderResult } from '@/lib/beeminder';

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);

const CONTINUATION_WINDOW_DAYS: Record<ProcessCadence, number> = {
  ONE_TIME: 0,
  DAILY: 2,
  WEEKLY: 9,
  BIWEEKLY: 16,
  MONTHLY: 35,
  QUARTERLY: 100,
  YEARLY: 380,
};

export type StreakCategory = 'aims' | 'processes' | 'reviews' | 'powerdown';

export interface StreakUpdateResult {
  beeminder?: BeeminderResult;
}

async function upsertOrUpdateStreak(
  userId: string,
  streakType: string,
  windowDays: number,
): Promise<StreakUpdateResult> {
  const today = startOfToday();

  const existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId, streakType } },
  });

  if (!existing) {
    await prisma.streak.create({
      data: { userId, streakType, currentCount: 1, bestCount: 1, lastActiveDate: today },
    });
    if (streakType === 'daily') {
      return { beeminder: await maybePostBeeminder(userId) };
    }
    return {};
  }

  if (!existing.isActive) return {};

  const lastActive = existing.lastActiveDate;
  if (lastActive && lastActive >= today) return {}; // idempotent same-day

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);
  const isContinuation = lastActive != null && lastActive >= windowStart;
  const newCount = isContinuation ? existing.currentCount + 1 : 1;

  await prisma.streak.update({
    where: { id: existing.id },
    data: {
      currentCount: newCount,
      bestCount: Math.max(existing.bestCount, newCount),
      lastActiveDate: today,
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
  return upsertOrUpdateStreak(userId, 'daily', 1);
}
