import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const streaks = await prisma.streak.findMany({
    where: { userId: auth.userId },
  });

  return Response.json(streaks);
}

/**
 * Update or create a streak for the user.
 * Called when a task is completed.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { streakType } = body;

  if (!streakType) {
    return Response.json({ error: 'streakType is required' }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId: auth.userId, streakType } },
  });

  if (existing) {
    const lastActive = existing.lastActiveDate;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newCount: number;
    if (lastActive && lastActive >= yesterday && lastActive < today) {
      // Continuing streak from yesterday
      newCount = existing.currentCount + 1;
    } else if (lastActive && lastActive >= today) {
      // Already updated today
      return Response.json(existing);
    } else {
      // Streak broken, start over
      newCount = 1;
    }

    const updated = await prisma.streak.update({
      where: { id: existing.id },
      data: {
        currentCount: newCount,
        bestCount: Math.max(existing.bestCount, newCount),
        lastActiveDate: today,
      },
    });

    // Create PublicWin at milestones
    if ([7, 14, 30, 50, 100].includes(newCount)) {
      await prisma.publicWin.create({
        data: {
          userId: auth.userId,
          message: `${newCount}-day ${streakType} streak!`,
        },
      });
    }

    return Response.json(updated);
  }

  const streak = await prisma.streak.create({
    data: {
      userId: auth.userId,
      streakType,
      currentCount: 1,
      bestCount: 1,
      lastActiveDate: today,
    },
  });

  return Response.json(streak, { status: 201 });
}
