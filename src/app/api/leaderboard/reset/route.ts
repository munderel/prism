import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

/**
 * POST /api/leaderboard/reset
 *
 * Resets the authenticated user's leaderboard. This is non-destructive on
 * historical data — existing tasks/reviews/aims/processes remain, but the
 * leaderboard query filters everything to items whose completion timestamp is
 * after `leaderboardResetAt`. In addition:
 * - Aim instance pointsEarned is zeroed (those are user-owned non-history data)
 * - PublicWin rows are deleted (they are milestone announcements tied to the streak)
 * - The "daily" Streak row is zeroed (currentCount -> 0, bestCount preserved)
 */
export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: auth.userId },
      data: { leaderboardResetAt: now },
    }),
    prisma.aimInstance.updateMany({
      where: { userId: auth.userId },
      data: { pointsEarned: 0 },
    }),
    prisma.publicWin.deleteMany({
      where: { userId: auth.userId },
    }),
    prisma.streak.updateMany({
      where: { userId: auth.userId, streakType: 'daily' },
      data: { currentCount: 0 },
    }),
  ]);

  return Response.json({ success: true, resetAt: now });
}
