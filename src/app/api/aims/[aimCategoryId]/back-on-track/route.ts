import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { backOnTrack } from '@/lib/derailing-buffer';

/**
 * POST /api/aims/[aimCategoryId]/back-on-track
 *
 * Clears `derailedAt` and resets the safety buffer to a small positive value
 * so the user has a fresh window to re-establish the habit.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ aimCategoryId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { aimCategoryId } = await params;

  const userAim = await prisma.userAim.findFirst({
    where: { userId: auth.userId, aimCategoryId },
  });
  if (!userAim) {
    return Response.json({ error: 'Aim not found' }, { status: 404 });
  }

  await backOnTrack(userAim.id);

  return Response.json({ ok: true });
}
