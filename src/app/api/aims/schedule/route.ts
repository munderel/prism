import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { getEffectiveDuration } from '@/lib/aim-phases';

/**
 * POST /api/aims/schedule
 *
 * Creates recurring AimInstance records for the next 4 weeks based on
 * selected days-of-week and start times.
 *
 * Body:
 * {
 *   aimCategoryId: string,
 *   days: [{ dayOfWeek: 0-6, timeStart: "HH:mm" }]
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { aimCategoryId, days } = body;

  if (!aimCategoryId) {
    return Response.json({ error: 'aimCategoryId is required' }, { status: 400 });
  }
  if (!Array.isArray(days) || days.length === 0) {
    return Response.json({ error: 'days must be a non-empty array' }, { status: 400 });
  }

  // Validate each day entry
  for (const day of days) {
    if (typeof day.dayOfWeek !== 'number' || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      return Response.json({ error: 'Each day must have dayOfWeek 0-6' }, { status: 400 });
    }
    if (!day.timeStart || !/^\d{2}:\d{2}$/.test(day.timeStart)) {
      return Response.json({ error: 'Each day must have timeStart in HH:mm format' }, { status: 400 });
    }
  }

  // Verify category exists
  const category = await prisma.aimCategory.findUnique({ where: { id: aimCategoryId } });
  if (!category) {
    return Response.json({ error: 'AimCategory not found' }, { status: 404 });
  }

  // Get UserAim for effective duration calculation
  const userAim = await prisma.userAim.findUnique({
    where: {
      userId_aimCategoryId: {
        userId: auth.userId,
        aimCategoryId,
      },
    },
    include: { aimCategory: true },
  });

  const durationMin = userAim
    ? getEffectiveDuration({
        customDuration: userAim.customDuration,
        customFrequency: userAim.customFrequency,
        currentPhase: userAim.currentPhase,
        phaseStartedAt: userAim.phaseStartedAt,
        aimCategory: {
          defaultDurationMin: userAim.aimCategory.defaultDurationMin,
          defaultFrequency: userAim.aimCategory.defaultFrequency,
        },
      })
    : category.defaultDurationMin;

  // Generate instances for the next 4 weeks (28 days)
  const WEEKS = 4;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentDayOfWeek = today.getDay(); // 0 = Sunday

  const instancesToCreate: {
    userId: string;
    aimCategoryId: string;
    scheduledDate: Date;
    timeBlockStart: Date;
    timeBlockEnd: Date;
  }[] = [];

  for (const { dayOfWeek, timeStart } of days) {
    const [hours, minutes] = timeStart.split(':').map(Number);

    for (let week = 0; week < WEEKS; week++) {
      // Calculate the date for this dayOfWeek in this week
      let daysUntil = dayOfWeek - currentDayOfWeek;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0 && week === 0) {
        // If today is the target day, include it only if the time hasn't passed
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = hours * 60 + minutes;
        if (nowMinutes > targetMinutes) {
          daysUntil += 7; // Push to next week
        }
      }

      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntil + week * 7);

      const blockStart = new Date(targetDate);
      blockStart.setHours(hours, minutes, 0, 0);

      const blockEnd = new Date(blockStart);
      blockEnd.setMinutes(blockEnd.getMinutes() + durationMin);

      instancesToCreate.push({
        userId: auth.userId,
        aimCategoryId,
        scheduledDate: targetDate,
        timeBlockStart: blockStart,
        timeBlockEnd: blockEnd,
      });
    }
  }

  // Batch create all instances with createMany, then fetch with includes
  await prisma.aimInstance.createMany({ data: instancesToCreate });

  // Retrieve the created instances with their related data
  const created = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: { in: instancesToCreate.map((i) => i.scheduledDate) },
    },
    include: { aimCategory: true },
    orderBy: { scheduledDate: 'asc' },
  });

  return Response.json(created, { status: 201 });
}
