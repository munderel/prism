import { toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';

/**
 * Recalculate aim progress using "consecutive weeks on-target" streaks.
 *
 * Weeks are Mon-Sun in the user's timezone. A week is "on-target" when the
 * number of completed instances that week >= the aim's frequency
 * (customFrequency ?? defaultFrequency). The streak counts consecutive
 * on-target weeks. If the current week isn't on-target yet, the streak
 * reflects the run ending at the most recent fully on-target week.
 *
 * Shared between the in-app PATCH (src/app/api/aims/instances/[id]/route.ts)
 * and the email-link external completion
 * (src/app/api/aims/instances/[id]/complete-external/route.ts) so both
 * pathways keep the `UserAim` aggregate progress in sync.
 */
export async function recalculateUserAimProgress(userId: string, aimCategoryId: string) {
  const [userAim, user] = await Promise.all([
    prisma.userAim.findUnique({
      where: { userId_aimCategoryId: { userId, aimCategoryId } },
      include: { aimCategory: { select: { defaultFrequency: true } } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  if (!userAim) return;
  const timezone = user?.timezone ?? 'America/New_York';

  const frequency = userAim.customFrequency ?? userAim.aimCategory.defaultFrequency;

  const completedInstances = await prisma.aimInstance.findMany({
    where: { userId, aimCategoryId, status: 'COMPLETED' },
    orderBy: { scheduledDate: 'asc' },
    select: { scheduledDate: true, completedAt: true },
  });

  // Bucket completions by Mon-Sun week key (ISO week start date)
  const weekCounts = new Map<string, number>();
  for (const inst of completedInstances) {
    const d = toZonedTime(new Date(inst.scheduledDate), timezone);
    // Shift so Monday = 0
    const dayOfWeek = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }

  // Sort week keys chronologically
  const sortedWeeks = Array.from(weekCounts.keys()).sort();

  // Count consecutive on-target weeks
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;
  let previousMonday: Date | null = null;

  for (const weekKey of sortedWeeks) {
    const count = weekCounts.get(weekKey)!;
    const [y, m, d] = weekKey.split('-').map(Number);
    const thisMonday = new Date(y, m - 1, d);

    if (count < frequency) {
      // Week not on-target — break the streak
      runningStreak = 0;
      previousMonday = thisMonday;
      continue;
    }

    // On-target week
    if (!previousMonday) {
      runningStreak = 1;
    } else {
      const diffDays = Math.round((thisMonday.getTime() - previousMonday.getTime()) / 86400000);
      runningStreak = diffDays === 7 ? runningStreak + 1 : 1;
    }
    bestStreak = Math.max(bestStreak, runningStreak);
    currentStreak = runningStreak;
    previousMonday = thisMonday;
  }

  // If the most recent on-target week isn't this week or last week, streak is broken
  if (sortedWeeks.length > 0 && currentStreak > 0) {
    const now = toZonedTime(new Date(), timezone);
    const todayDow = (now.getDay() + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - todayDow);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    const lastOnTargetKey = sortedWeeks.filter(k => weekCounts.get(k)! >= frequency).pop();
    if (lastOnTargetKey) {
      const [y, m, d] = lastOnTargetKey.split('-').map(Number);
      const lastOnTargetMonday = new Date(y, m - 1, d);
      if (lastOnTargetMonday < lastMonday) {
        currentStreak = 0;
      }
    }
  }

  await prisma.userAim.update({
    where: { id: userAim.id },
    data: {
      completionCount: completedInstances.length,
      currentStreak,
      bestStreak,
      lastCompletedAt: completedInstances[completedInstances.length - 1]?.scheduledDate ?? null,
    },
  });
}
