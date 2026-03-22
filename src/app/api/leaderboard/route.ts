import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Get all users with their streaks and task counts
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      streaks: {
        where: { streakType: 'daily_completion' },
        select: { currentCount: true, bestCount: true },
      },
      tasks: {
        where: { status: 'DONE' },
        select: { id: true },
      },
      reviews: {
        where: { completedAt: { not: null } },
        select: { id: true },
      },
    },
  });

  const leaderboard = users.map((u) => ({
    id: u.id,
    name: u.name ?? 'Unknown',
    image: u.image,
    streak: u.streaks[0]?.currentCount ?? 0,
    bestStreak: u.streaks[0]?.bestCount ?? 0,
    tasksCompleted: u.tasks.length,
    reviewsCompleted: u.reviews.length,
    score: (u.streaks[0]?.currentCount ?? 0) * 10 + u.tasks.length + u.reviews.length * 5,
  }));

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

  return Response.json({ leaderboard, publicWins });
}
