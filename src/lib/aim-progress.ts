import { prisma } from '@/lib/prisma';

/**
 * Recalculate a UserAim's aggregate progress: `completionCount` and
 * `lastCompletedAt`.
 *
 * NOTE: This function intentionally does NOT write `currentStreak` /
 * `bestStreak`. Those columns have a single canonical owner —
 * `recomputeAimStreaks` in src/lib/streak-recompute.ts, which uses the
 * daily-vs-weekly engine (computeDailyStreak / computeWeeklyStreak). Previously
 * this function ALSO wrote the streak columns with a different (week-frequency)
 * algorithm, and the PATCH handler fired `recomputeAimStreaks` afterwards
 * fire-and-forget, so the persisted streak was nondeterministic (last writer
 * won) and diverged between the in-app and email-completion paths. Callers must
 * invoke `recomputeAimStreaks` for streak updates.
 *
 * Shared between the in-app PATCH (src/app/api/aims/instances/[id]/route.ts)
 * and the email-link external completion
 * (src/app/api/aims/instances/[id]/complete-external/route.ts).
 */
export async function recalculateUserAimProgress(userId: string, aimCategoryId: string) {
  const userAim = await prisma.userAim.findUnique({
    where: { userId_aimCategoryId: { userId, aimCategoryId } },
    select: { id: true },
  });
  if (!userAim) return;

  const completedInstances = await prisma.aimInstance.findMany({
    where: { userId, aimCategoryId, status: 'COMPLETED' },
    orderBy: { scheduledDate: 'asc' },
    select: { scheduledDate: true },
  });

  await prisma.userAim.update({
    where: { id: userAim.id },
    data: {
      completionCount: completedInstances.length,
      lastCompletedAt: completedInstances[completedInstances.length - 1]?.scheduledDate ?? null,
    },
  });
}
