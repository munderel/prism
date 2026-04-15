import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, createStreakSchema } from '@/lib/schemas';
import { upsertOrUpdateStreak } from '@/lib/streak-engine';

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
 * Delegates to the streak engine (cadence-aware, respects isActive).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createStreakSchema);
  if ('error' in parsed) return parsed.error;
  const { streakType } = parsed.data;

  await upsertOrUpdateStreak(auth.userId, streakType, 1);

  const streak = await prisma.streak.findUnique({
    where: { userId_streakType: { userId: auth.userId, streakType } },
  });

  return Response.json(streak);
}
