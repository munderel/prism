import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';

/**
 * Leaderboard scoring — rebuilt to reward *using the app* rather than raw
 * completion counts (Issue 10):
 *
 *   score = streakPoints            // ALL streak types (daily, powerdown,
 *                                   //   review_*, aim_*, process_*), each
 *                                   //   currentCount weighted by type
 *         + reviews        * 5
 *         + qualifyingTasks * 3     // only tasks of MIN_MINUTES+ effort count
 *         + aimScore                // pointsEarned for aims of MIN_MINUTES+
 *         + powerdownCount * 5
 *         + processCompletions * 3
 *
 * Tasks and aims must clear MIN_MINUTES of effort to score, so a flurry of
 * 5-minute checkboxes can't out-rank sustained, focused work. Non-streak
 * counts are windowed to items completed after the user's `leaderboardResetAt`.
 */
const MIN_MINUTES = 60; // a task/aim must be at least this long to score

const WEIGHT_TASK = 3;
const WEIGHT_REVIEW = 5;
const WEIGHT_POWERDOWN = 5;
const WEIGHT_PROCESS = 3;

/** Per-type weight applied to each streak's currentCount. Daily ranks highest. */
function streakWeight(streakType: string | null | undefined): number {
  if (!streakType) return 4;
  if (streakType === 'daily') return 10;
  if (streakType === 'powerdown') return 8;
  if (streakType.startsWith('review')) return 6;
  if (streakType.startsWith('aim')) return 4;
  if (streakType.startsWith('process')) return 4;
  return 4;
}

interface AimDurationFields {
  actualMinutes: number | null;
  timeBlockStart: Date | null;
  timeBlockEnd: Date | null;
  aimCategory: { defaultDurationMin: number } | null;
}

/** Effective minutes for an aim instance: actual, else scheduled block, else category default. */
function aimEffectiveMinutes(a: AimDurationFields): number {
  if (a.actualMinutes != null) return a.actualMinutes;
  if (a.timeBlockStart && a.timeBlockEnd) {
    return Math.max(0, Math.round((a.timeBlockEnd.getTime() - a.timeBlockStart.getTime()) / 60000));
  }
  return a.aimCategory?.defaultDurationMin ?? 0;
}

function computeScore(args: {
  streakPoints: number;
  reviews: number;
  qualifyingTasks: number;
  aimScore: number;
  powerdownCount: number;
  processCompletions: number;
}): number {
  return (
    args.streakPoints +
    args.reviews * WEIGHT_REVIEW +
    args.qualifyingTasks * WEIGHT_TASK +
    args.aimScore +
    args.powerdownCount * WEIGHT_POWERDOWN +
    args.processCompletions * WEIGHT_PROCESS
  );
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
  // runs for users who could plausibly be on the leaderboard. We now fetch
  // ALL of each user's streaks (not just 'daily') so every active streak
  // contributes to the score.
  const users = await prisma.user.findMany({
    where: { isPublicOnLeaderboard: true },
    take: MAX_PUBLIC_USERS,
    select: {
      id: true,
      name: true,
      image: true,
      leaderboardResetAt: true,
      streaks: {
        select: { streakType: true, currentCount: true, bestCount: true },
      },
    },
    orderBy: [
      { streaks: { _count: 'desc' } },
      { createdAt: 'asc' },
    ],
  });

  const publicUserIds = users.map((u) => u.id);

  // Each per-table findMany is scoped to the capped public-user set. Tasks are
  // pre-filtered to the MIN_MINUTES effort gate at the DB level; aims carry the
  // fields needed to compute effective duration and are gated in app code.
  const [aimInstances, processExecutions, powerdownSessions, taskCounts, reviewCounts, publicWins] = await Promise.all([
    prisma.aimInstance.findMany({
      where: { userId: { in: publicUserIds }, status: 'COMPLETED', completedAt: { not: null } },
      select: {
        userId: true,
        completedAt: true,
        pointsEarned: true,
        actualMinutes: true,
        timeBlockStart: true,
        timeBlockEnd: true,
        aimCategory: { select: { defaultDurationMin: true } },
      },
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
      where: {
        ownerId: { in: publicUserIds },
        status: 'DONE',
        completedAt: { not: null },
        estimatedMinutes: { gte: MIN_MINUTES },
      },
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

  // Aim points — only aims that clear the MIN_MINUTES effort gate count.
  const aimPointsByUser = new Map<string, { points: number; count: number }>();
  for (const a of aimInstances) {
    if (!passes(a.userId, a.completedAt)) continue;
    if (aimEffectiveMinutes(a) < MIN_MINUTES) continue;
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
      // Headline "streak" stays the daily streak; score sums ALL streak types.
      const dailyStreak = u.streaks.find((s) => s.streakType === 'daily');
      const streakPoints = u.streaks.reduce(
        (sum, s) => sum + s.currentCount * streakWeight(s.streakType),
        0,
      );
      const aimData = aimPointsByUser.get(u.id) ?? { points: 0, count: 0 };
      const processCompletions = processCountByUser.get(u.id) ?? 0;
      const powerdownCount = powerdownCountByUser.get(u.id) ?? 0;
      const tasksCompleted = taskCountByUser.get(u.id) ?? 0;
      const reviewsCompleted = reviewCountByUser.get(u.id) ?? 0;
      return {
        id: u.id,
        name: u.name ?? 'Unknown',
        image: u.image,
        streak: dailyStreak?.currentCount ?? 0,
        bestStreak: dailyStreak?.bestCount ?? 0,
        tasksCompleted,
        reviewsCompleted,
        aimsCompleted: aimData.count,
        aimScore: aimData.points,
        processCompletions,
        powerdownCount,
        score: computeScore({
          streakPoints,
          reviews: reviewsCompleted,
          qualifyingTasks: tasksCompleted,
          aimScore: aimData.points,
          powerdownCount,
          processCompletions,
        }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_TOP_N);

  return Response.json({ leaderboard, publicWins }, {
    headers: cacheHeaders(30, 120),
  });
}
