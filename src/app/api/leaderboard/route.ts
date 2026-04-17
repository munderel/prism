import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';

/**
 * Score formula:
 *   streak*10 + powerdownCount*5 + tasks + reviews*5 + aimPoints + processCompletions*3
 *
 * All non-streak counts are windowed to items completed after the user's
 * `leaderboardResetAt` marker so resetting the leaderboard is actually visible.
 * The streak is a live counter; reset zeroes it separately.
 */
function computeScore(
  streak: number,
  powerdownCount: number,
  tasks: number,
  reviews: number,
  aimPoints: number,
  processCompletions: number,
): number {
  return streak * 10 + powerdownCount * 5 + tasks + reviews * 5 + aimPoints + processCompletions * 3;
}

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Get every public user's reset marker so we can window their counts.
  const users = await prisma.user.findMany({
    where: { isPublicOnLeaderboard: true },
    select: {
      id: true,
      name: true,
      image: true,
      leaderboardResetAt: true,
      streaks: {
        where: { streakType: 'daily' },
        select: { currentCount: true, bestCount: true },
      },
    },
  });

  // Group counts for aim points, aim completions, process completions,
  // powerdown completions — scoped per-user but unfiltered by date here;
  // we'll reconcile against each user's resetAt below. (groupBy with
  // per-row resetAt conditions isn't expressible, so we fetch the raw
  // completion timestamps and aggregate in app code.)
  const [aimInstances, processExecutions, powerdownSessions, taskCounts, reviewCounts, publicWins] = await Promise.all([
    prisma.aimInstance.findMany({
      where: { status: 'COMPLETED', completedAt: { not: null } },
      select: { userId: true, completedAt: true, pointsEarned: true },
    }),
    prisma.processExecution.findMany({
      where: { completedAt: { not: null }, executedById: { not: null } },
      select: { executedById: true, completedAt: true },
    }),
    prisma.powerdownSession.findMany({
      where: { completedAt: { not: null } },
      select: { userId: true, completedAt: true },
    }),
    prisma.task.findMany({
      where: { status: 'DONE', completedAt: { not: null } },
      select: { ownerId: true, completedAt: true },
    }),
    prisma.review.findMany({
      where: { completedAt: { not: null } },
      select: { userId: true, completedAt: true },
    }),
    prisma.publicWin.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, image: true } },
        goal: { select: { title: true } },
      },
    }),
  ]);

  const resetAtByUser = new Map(users.map((u) => [u.id, u.leaderboardResetAt]));
  const passes = (userId: string, completedAt: Date | null): boolean => {
    if (!completedAt) return false;
    const resetAt = resetAtByUser.get(userId);
    return !resetAt || completedAt >= resetAt;
  };

  const aimPointsByUser = new Map<string, { points: number; count: number }>();
  for (const a of aimInstances) {
    if (!passes(a.userId, a.completedAt)) continue;
    const entry = aimPointsByUser.get(a.userId) ?? { points: 0, count: 0 };
    entry.points += a.pointsEarned ?? 0;
    entry.count += 1;
    aimPointsByUser.set(a.userId, entry);
  }

  const processCountByUser = new Map<string, number>();
  for (const p of processExecutions) {
    if (!p.executedById || !passes(p.executedById, p.completedAt)) continue;
    processCountByUser.set(p.executedById, (processCountByUser.get(p.executedById) ?? 0) + 1);
  }

  const powerdownCountByUser = new Map<string, number>();
  for (const s of powerdownSessions) {
    if (!passes(s.userId, s.completedAt)) continue;
    powerdownCountByUser.set(s.userId, (powerdownCountByUser.get(s.userId) ?? 0) + 1);
  }

  const taskCountByUser = new Map<string, number>();
  for (const t of taskCounts) {
    if (!passes(t.ownerId, t.completedAt)) continue;
    taskCountByUser.set(t.ownerId, (taskCountByUser.get(t.ownerId) ?? 0) + 1);
  }

  const reviewCountByUser = new Map<string, number>();
  for (const r of reviewCounts) {
    if (!passes(r.userId, r.completedAt)) continue;
    reviewCountByUser.set(r.userId, (reviewCountByUser.get(r.userId) ?? 0) + 1);
  }

  const leaderboard = users
    .map((u) => {
      const streak = u.streaks[0]?.currentCount ?? 0;
      const aimData = aimPointsByUser.get(u.id) ?? { points: 0, count: 0 };
      const processCompletions = processCountByUser.get(u.id) ?? 0;
      const powerdownCount = powerdownCountByUser.get(u.id) ?? 0;
      const tasksCompleted = taskCountByUser.get(u.id) ?? 0;
      const reviewsCompleted = reviewCountByUser.get(u.id) ?? 0;
      return {
        id: u.id,
        name: u.name ?? 'Unknown',
        image: u.image,
        streak,
        bestStreak: u.streaks[0]?.bestCount ?? 0,
        tasksCompleted,
        reviewsCompleted,
        aimsCompleted: aimData.count,
        aimScore: aimData.points,
        processCompletions,
        powerdownCount,
        score: computeScore(streak, powerdownCount, tasksCompleted, reviewsCompleted, aimData.points, processCompletions),
      };
    })
    .sort((a, b) => b.score - a.score);

  return Response.json({ leaderboard, publicWins }, {
    headers: cacheHeaders(30, 120),
  });
}
