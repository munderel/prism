import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

/**
 * POST /api/leaderboard/reset
 *
 * Resets the authenticated user's leaderboard data:
 * - Zeroes all AimInstance pointsEarned
 * - Deletes all PublicWin records
 */
export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  await prisma.$transaction([
    prisma.aimInstance.updateMany({
      where: { userId: auth.userId },
      data: { pointsEarned: 0 },
    }),
    prisma.publicWin.deleteMany({
      where: { userId: auth.userId },
    }),
  ]);

  return Response.json({ success: true });
}
