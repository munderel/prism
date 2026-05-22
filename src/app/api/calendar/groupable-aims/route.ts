import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';

/**
 * GET /api/calendar/groupable-aims?date=YYYY-MM-DD
 *
 * Returns AimInstances for the given date (or date range via start/end) that:
 *  - Belong to a teammate (any other user in the system)
 *  - Have aimCategory.isGroupable === true
 *  - Have not been dismissed as NOT_GOING by the requesting user
 *
 * attendStatus is computed from the requesting user's perspective:
 *  - GOING: user has their own AimInstance for the same (aimCategoryId, scheduledDate)
 *  - MAYBE: user has an AimInstanceDismissal with status='MAYBE'
 *  - NONE:  no own instance and no dismissal
 *
 * Response shape per item:
 *  { id, scheduledDate, timeBlockStart, timeBlockEnd,
 *    aimCategory: { id, name, isDaily },
 *    owner: { id, name, image },
 *    attendStatus: 'NONE' | 'GOING' | 'MAYBE' | 'NOT_GOING' }
 *
 * "Teammates" in this codebase = all other authenticated users (no Team model).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  let rangeStart: Date;
  let rangeEnd: Date;

  if (startParam && endParam) {
    rangeStart = new Date(startParam);
    rangeEnd = new Date(endParam);
  } else if (dateParam) {
    // Single date: treat as full UTC day
    rangeStart = new Date(`${dateParam}T00:00:00.000Z`);
    rangeEnd = new Date(`${dateParam}T23:59:59.999Z`);
  } else {
    return Response.json({ error: 'date or start+end is required' }, { status: 400 });
  }

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return Response.json({ error: 'Invalid date format' }, { status: 400 });
  }
  if (rangeStart >= rangeEnd) {
    return Response.json({ error: 'start must be before end' }, { status: 400 });
  }

  // Fetch teammate AIM instances for the date range
  const instances = await prisma.aimInstance.findMany({
    where: {
      userId: { not: auth.userId },
      scheduledDate: { gte: rangeStart, lte: rangeEnd },
      aimCategory: { isGroupable: true },
    },
    include: {
      aimCategory: {
        select: { id: true, name: true, isDaily: true },
      },
      user: {
        select: { id: true, name: true, image: true },
      },
      dismissals: {
        where: { userId: auth.userId },
        select: { id: true, status: true },
      },
    },
  });

  // Filter out instances the user has already dismissed (NOT_GOING dismissal = hide)
  // MAYBE dismissal = still show (user is interested but hasn't committed)
  const visibleInstances = instances.filter((inst) => {
    const dismissal = inst.dismissals[0];
    if (!dismissal) return true;
    // Only hide if explicitly NOT_GOING
    return dismissal.status !== 'NOT_GOING';
  });

  // Collect aimCategoryIds + times to check if user already has own instances
  const categoryTimeKeys = visibleInstances.map((inst) => ({
    aimCategoryId: inst.aimCategoryId,
    scheduledDate: inst.scheduledDate,
    timeBlockStart: inst.timeBlockStart,
  }));

  // Bulk-fetch user's own AIM instances that might overlap
  const ownInstances = categoryTimeKeys.length > 0
    ? await prisma.aimInstance.findMany({
        where: {
          userId: auth.userId,
          scheduledDate: { gte: rangeStart, lte: rangeEnd },
          aimCategoryId: { in: Array.from(new Set(categoryTimeKeys.map((k) => k.aimCategoryId))) },
        },
        select: { aimCategoryId: true, scheduledDate: true, timeBlockStart: true },
      })
    : [];

  // Build a lookup set for "already attending" check
  // Key: aimCategoryId + scheduledDate ISO
  const ownCategoryDateSet = new Set<string>(
    ownInstances.map((o) => `${o.aimCategoryId}:${o.scheduledDate.toISOString()}`),
  );

  const result = visibleInstances.map((inst) => {
    const dismissal = inst.dismissals[0];
    // If the user has their own AimInstance for the same category+date, they are
    // attending — surface as GOING so the ephemeral tile shows a ✓ badge instead
    // of being hidden entirely. This keeps teammate context visible after attending.
    const key = `${inst.aimCategoryId}:${inst.scheduledDate.toISOString()}`;
    const hasOwnInstance = ownCategoryDateSet.has(key);

    let attendStatus: 'NONE' | 'GOING' | 'MAYBE' | 'NOT_GOING' = 'NONE';
    if (hasOwnInstance) attendStatus = 'GOING';
    else if (dismissal?.status === 'MAYBE') attendStatus = 'MAYBE';

    return {
      id: inst.id,
      scheduledDate: inst.scheduledDate.toISOString(),
      timeBlockStart: inst.timeBlockStart?.toISOString() ?? null,
      timeBlockEnd: inst.timeBlockEnd?.toISOString() ?? null,
      aimCategory: inst.aimCategory,
      owner: inst.user,
      attendStatus,
    };
  });

  return Response.json(result, { headers: cacheHeaders(30, 60) });
}
