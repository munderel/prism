import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

/**
 * POST /api/streaks/reset
 *
 * Resets all streaks for the authenticated user.
 * Sets currentCount=0, breakReason='Manual reset', lastActiveDate=null.
 * Leaves isActive untouched so the engine still records the next completion —
 * "reset" means "start over", not "silence the engine forever".
 * Preserves bestCount unless ?includeBest=true is passed.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const includeBest = searchParams.get('includeBest') === 'true';

  const data: Record<string, unknown> = {
    currentCount: 0,
    breakReason: 'Manual reset',
    lastActiveDate: null,
  };

  if (includeBest) {
    data.bestCount = 0;
  }

  await prisma.streak.updateMany({
    where: { userId: auth.userId },
    data,
  });

  return Response.json({ success: true });
}
