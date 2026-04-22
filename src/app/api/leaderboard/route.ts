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

// Leaderboard query cap. At this size, the app-side resetAt reconciliation
// still runs in a few hundred MB of heap even for very active users; above
// it we'd risk OOM under load. Bounded per-table so a single hot table
// (tasks) can't starve the others.
const MAX_PUBLIC_USERS = 1000;
const MAX_ROWS_PER_TABLE = 50_000;
const LEADERBOARD_TOP_N = 100;

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Bound the outer user set up-front; score + reset reconciliation only
  // runs for users who could plausibly be on the leaderboard. Ordered by
  // best streak + name as a stable proxy for engagement — the full score
  // can't be known before the per-table counts fire, but best streak is
  // cheap and strongly correlated with activity.
  const users = await prisma.user.findMany({
    where: { isPublicOnLeaderboard: true },
    take: MAX_PUBLIC_USERS,
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
    orderBy: [
      { streaks: { _count: 'desc' } },
      { createdAt: 'asc' },
    ],
  });

  const publicUserIds = users.map((u) => u.id);

  // Each per-table findMany is scoped to the capped public-user set so a
  // huge non-public or locked-out cohort can't inflate the fetch. The
  // take: MAX_ROWS_PER_TABLE is a defence-in-depth bound — exceeding it
  // means a single user has 50k+ completions of one kind; score
  // saturation is acceptable at that point and far preferable to OOM.
  const [aimInstances, processExecutions, powerdownSessions, taskCounts, reviewCounts, publicWins] = await Promise.all([
    prisma.aimInstance.findMany({
      where: { userId: { in: publicUserIds }, status: 'COMPLETED', completedAt: { not: null } },
      select: { userId: true, completedAt: true, pointsEarned: true },
      take: MAX_ROWS_PER_TABLE,
      orderBy: { completedAt: 'desc' },
    }),
    prisma.processExecution.findMany({
      where: { executedById: { in: publicUserIds }, completedAt: { not: null } },
      select: { executedById: true, completedAt: true },
      take: MAX_ROWS_PER_TABLE,
      orderBy: { completedAt: 'desc' },
    }),
    prisma.powerdownSession.findMany({
      where: { userId: { in: publicUserIds }, completedAt: { not: null } },
      select: { userId: true, completedAt: true },
      take: MAX_ROWS_PER_TABLE,
      orderBy: { completedAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { ownerId: { in: publicUserIds }, status: 'DONE', completedAt: { not: null } },
      select: { ownerId: true, completedAt: true },
      take: MAX_ROWS_PER_TABLE,
      orderBy: { completedAt: 'desc' },
    }),
    prisma.review.findMany({
      where: { userId: { in: publicUserIds }, completedAt: { not: null } },
      select: { userId: true, completedAt: true },
      take: MAX_ROWS_PER_TABLE,
      orderBy: { completedAt: 'desc' },
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
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_TOP_N);

  return Response.json({ leaderboard, publicWins }, {
    headers: cacheHeaders(30, 120),
  });
}
