import { ProcessCadence } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);

/**
 * Maximum gap (in days) allowed between completions for the streak to continue.
 * Roughly cadence_duration * 1.5 to allow reasonable flexibility.
 */
const CONTINUATION_WINDOW_DAYS: Record<ProcessCadence, number> = {
  ONE_TIME: 0,
  DAILY: 2,
  WEEKLY: 9,
  BIWEEKLY: 16,
  MONTHLY: 35,
  QUARTERLY: 100,
  YEARLY: 380,
};

/**
 * Update the per-process streak for a user after completing a process occurrence.
 * Uses cadence-aware windows instead of the daily "was yesterday active?" check.
 */
export async function updateProcessStreak(
  userId: string,
  processId: string,
  cadence: ProcessCadence
): Promise<void> {
  if (cadence === 'ONE_TIME') return;

  const streakType = `process_${processId}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId, streakType } },
  });

  if (!existing) {
    await prisma.streak.create({
      data: {
        userId,
        streakType,
        currentCount: 1,
        bestCount: 1,
        lastActiveDate: today,
      },
    });
    return;
  }

  const lastActive = existing.lastActiveDate;

  // Already updated today
  if (lastActive && lastActive >= today) return;

  const windowDays = CONTINUATION_WINDOW_DAYS[cadence];
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
      data: {
        userId,
        message: `${newCount}-period ${streakType.replace('process_', '')} process streak!`,
      },
    });
  }
}

/**
 * Reset a process streak when a period is missed.
 * Called from the lazy checker when it detects a missed cadence window.
 */
export async function resetProcessStreak(
  userId: string,
  processId: string
): Promise<void> {
  const streakType = `process_${processId}`;
  await prisma.streak.updateMany({
    where: { userId, streakType },
    data: { currentCount: 0 },
  });
}
