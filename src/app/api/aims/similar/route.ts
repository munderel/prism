import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders, notFoundResponse } from '@/lib/api-helpers';
import { levenshtein, normalizeName } from '@/lib/name-similarity';

/**
 * GET /api/aims/similar?aimCategoryId=...
 *
 * Returns the auth'd user's active UserAims sorted by name similarity to the
 * given AimCategory. Used by AttendAimModal's "Link to similar AIM" picker.
 *
 * Sort is by simple Levenshtein distance on lowercased names — adequate for
 * the typical handful (< a few dozen) of UserAims a single user has. No
 * truncation: caller receives the full list, best match first.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const aimCategoryId = searchParams.get('aimCategoryId');
  if (!aimCategoryId) {
    return Response.json(
      { error: 'aimCategoryId query parameter is required' },
      { status: 400 },
    );
  }

  const category = await prisma.aimCategory.findUnique({
    where: { id: aimCategoryId },
    select: { id: true, name: true },
  });
  if (!category) return notFoundResponse('AimCategory');

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: {
      aimCategory: {
        select: { id: true, name: true, isDaily: true },
      },
    },
  });

  const target = normalizeName(category.name);

  const scored = userAims.map((ua) => {
    const candidate = normalizeName(ua.aimCategory.name);
    const distance = levenshtein(target, candidate);
    return {
      id: ua.id,
      aimCategoryId: ua.aimCategoryId,
      name: ua.aimCategory.name,
      isDaily: ua.aimCategory.isDaily,
      currentPhase: ua.currentPhase,
      currentStreak: ua.currentStreak,
      distance,
    };
  });

  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.name.localeCompare(b.name);
  });

  return Response.json(
    { target: { id: category.id, name: category.name }, results: scored },
    { headers: cacheHeaders() },
  );
}
