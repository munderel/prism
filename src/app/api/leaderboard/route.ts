import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';

function computeScore(streak: number, tasks: number, reviews: number, aimPoints: number, processCompletions: number): number {
  return streak * 10 + tasks + reviews * 5 + aimPoints + processCompletions * 3;
}

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const [users, aimScores, publicWins, processCompletionCounts] = await Promise.all([
    prisma.user.findMany({
      where: { isPublicOnLeaderboard: true },
      select: {
        id: true,
        name: true,
        image: true,
        streaks: {
          where: { streakType: 'daily' },
          select: { currentCount: true, bestCount: true },
        },
        _count: {
          select: {
            tasks: { where: { status: 'DONE' } },
            reviews: { where: { completedAt: { not: null } } },
          },
        },
      },
    }),
    prisma.aimInstance.groupBy({
      by: ['userId'],
      where: { status: 'COMPLETED' },
      _sum: { pointsEarned: true },
      _count: true,
    }),
    prisma.publicWin.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, image: true } },
        goal: { select: { title: true } },
      },
    }),
    prisma.processExecution.groupBy({
      by: ['executedById'],
      where: { completedAt: { not: null } },
      _count: true,
    }),
  ]);

  const aimScoreMap = new Map(
    aimScores.map((a) => [a.userId, { points: a._sum.pointsEarned ?? 0, count: a._count }])
  );

  const processCountMap = new Map(
    processCompletionCounts
      .filter((p) => p.executedById != null)
      .map((p) => [p.executedById!, p._count])
  );

  const leaderboard = users
    .map((u) => {
      const streak = u.streaks[0]?.currentCount ?? 0;
      const aimData = aimScoreMap.get(u.id) ?? { points: 0, count: 0 };
      const processCompletions = processCountMap.get(u.id) ?? 0;
      return {
        id: u.id,
        name: u.name ?? 'Unknown',
        image: u.image,
        streak,
        bestStreak: u.streaks[0]?.bestCount ?? 0,
        tasksCompleted: u._count.tasks,
        reviewsCompleted: u._count.reviews,
        aimsCompleted: aimData.count,
        aimScore: aimData.points,
        processCompletions,
        score: computeScore(streak, u._count.tasks, u._count.reviews, aimData.points, processCompletions),
      };
    })
    .sort((a, b) => b.score - a.score);

  return Response.json({ leaderboard, publicWins }, {
    headers: cacheHeaders(30, 120),
  });
}
