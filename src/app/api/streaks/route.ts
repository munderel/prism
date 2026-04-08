import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { startOfToday } from '@/lib/date-utils';

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const typeFilter = request.nextUrl.searchParams.get('type');
  const where: Record<string, unknown> = { userId: auth.userId };
  if (typeFilter === 'process') {
    where.streakType = { startsWith: 'process_' };
  } else if (typeFilter === 'aim') {
    where.streakType = { startsWith: 'aim_' };
  }

  const streaks = await prisma.streak.findMany({ where });

  return Response.json(streaks);
}

/**
 * Update or create a streak for the user.
 * Called when a task is completed.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { streakType } = parsed.data;

  if (!streakType) {
    return Response.json({ error: 'streakType is required' }, { status: 400 });
  }

  const today = startOfToday();

  const existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId: auth.userId, streakType } },
  });

  if (!existing) {
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

  const lastActive = existing.lastActiveDate;

  // Already updated today
  if (lastActive && lastActive >= today) {
    return Response.json(existing);
  }

  // Continue streak if last active yesterday, otherwise reset to 1
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isContinuation = lastActive != null && lastActive >= yesterday;
  const newCount = isContinuation ? existing.currentCount + 1 : 1;

  const updated = await prisma.streak.update({
    where: { id: existing.id },
    data: {
      currentCount: newCount,
      bestCount: Math.max(existing.bestCount, newCount),
      lastActiveDate: today,
    },
  });

  if (STREAK_MILESTONES.has(newCount)) {
    await prisma.publicWin.create({
      data: {
        userId: auth.userId,
        message: `${newCount}-day ${streakType} streak!`,
      },
    });
  }

  return Response.json(updated);
}
