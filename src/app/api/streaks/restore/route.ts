import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { dstSafeDate, toUserDayStamp } from '@/lib/user-timezone';

const LOOKBACK_DAYS = 120;

function shiftDayStamp(stamp: string, days: number): string {
  const [y, m, d] = stamp.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * POST /api/streaks/restore
 *
 * Backfills the user's master 'daily' streak from PowerdownSession history.
 * Counts consecutive days (in the user's timezone) ending at today (or
 * yesterday if today's powerdown isn't done yet) where at least one powerdown
 * was completed. Sets isActive=true and clears any prior break reason — this
 * is the user-facing "I'm not paused, my streak just got eaten by a bug" exit.
 */
export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? 'America/New_York';

  const now = new Date();
  const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);

  const sessions = await prisma.powerdownSession.findMany({
    where: {
      userId: auth.userId,
      completedAt: { not: null, gte: lookbackStart },
    },
    select: { completedAt: true },
  });

  const completedDays = new Set<string>();
  for (const s of sessions) {
    if (s.completedAt) completedDays.add(toUserDayStamp(s.completedAt, tz));
  }

  const todayStamp = toUserDayStamp(now, tz);
  const yesterdayStamp = shiftDayStamp(todayStamp, -1);
  const startOffset = completedDays.has(todayStamp)
    ? 0
    : completedDays.has(yesterdayStamp) ? 1 : null;

  let count = 0;
  let lastActiveDate: Date | null = null;
  if (startOffset !== null) {
    lastActiveDate = dstSafeDate(shiftDayStamp(todayStamp, -startOffset), tz);
    for (let i = startOffset; i <= LOOKBACK_DAYS; i++) {
      if (completedDays.has(shiftDayStamp(todayStamp, -i))) {
        count++;
      } else {
        break;
      }
    }
  }

  const existing = await prisma.streak.findUnique({
    where: { userId_streakType: { userId: auth.userId, streakType: 'daily' } },
    select: { bestCount: true },
  });
  const newBest = Math.max(existing?.bestCount ?? 0, count);

  const restored = await prisma.streak.upsert({
    where: { userId_streakType: { userId: auth.userId, streakType: 'daily' } },
    update: {
      currentCount: count,
      bestCount: newBest,
      lastActiveDate,
      isActive: true,
      breakReason: null,
    },
    create: {
      userId: auth.userId,
      streakType: 'daily',
      currentCount: count,
      bestCount: newBest,
      lastActiveDate,
      isActive: true,
    },
  });

  return Response.json(restored);
}
