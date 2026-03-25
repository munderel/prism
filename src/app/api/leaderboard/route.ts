import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Get all users with their streaks and task/review counts
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      streaks: {
        where: { streakType: 'daily_completion' },
        select: { currentCount: true, bestCount: true },
      },
      _count: {
        select: {
          tasks: { where: { status: 'DONE' } },
          reviews: { where: { completedAt: { not: null } } },
        },
      },
    },
  });

  // Get aim scores per user (sum of pointsEarned from completed instances)
  const aimScores = await prisma.aimInstance.groupBy({
    by: ['userId'],
    where: { status: 'COMPLETED' },
    _sum: { pointsEarned: true },
    _count: true,
  });

  const aimScoreMap = new Map(
    aimScores.map((a) => [a.userId, { points: a._sum.pointsEarned ?? 0, count: a._count }])
  );

  const leaderboard = users.map((u) => {
    const aimData = aimScoreMap.get(u.id) ?? { points: 0, count: 0 };
    return {
      id: u.id,
      name: u.name ?? 'Unknown',
      image: u.image,
      streak: u.streaks[0]?.currentCount ?? 0,
      bestStreak: u.streaks[0]?.bestCount ?? 0,
      tasksCompleted: u._count.tasks,
      reviewsCompleted: u._count.reviews,
      aimsCompleted: aimData.count,
      aimScore: aimData.points,
      score: (u.streaks[0]?.currentCount ?? 0) * 10 + u._count.tasks + u._count.reviews * 5 + aimData.points,
    };
  });

  leaderboard.sort((a, b) => b.score - a.score);

  // Get recent public wins
  const publicWins = await prisma.publicWin.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, image: true } },
      goal: { select: { title: true } },
    },
  });

  return new Response(JSON.stringify({ leaderboard, publicWins }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
    },
  });
}
