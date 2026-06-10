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
 *
 * It deliberately does NOT touch the live `Streak` rows. The Streak table is the
 * canonical streak STATE (it drives the daily/powerdown flame, milestones, derail
 * nags and Beeminder), not a leaderboard cache. Zeroing currentCount here made a
 * "leaderboard reset" silently destroy the user's real daily/powerdown/aim/process
 * streaks — and because lastActiveDate was left set, a same-day completion couldn't
 * even re-credit them. The reset now only re-windows the activity score via
 * `leaderboardResetAt`; streaks stay intact. (Use /api/streaks/reset to reset a
 * streak deliberately.)
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
  ]);

  return Response.json({ success: true, resetAt: now });
}
