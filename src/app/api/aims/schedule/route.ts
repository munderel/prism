import { NextRequest } from 'next/server';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, scheduleAimsSchema } from '@/lib/schemas';
import { getEffectiveDuration } from '@/lib/aim-phases';
import { parseDateOnly } from '@/lib/date-utils';
import { toUserDayStamp, shiftDayStamp } from '@/lib/user-timezone';
import { advisoryLock } from '@/lib/concurrency';

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

  const parsed = await parseBody(request, scheduleAimsSchema);
  if ('error' in parsed) return parsed.error;
  const { aimCategoryId, days } = parsed.data;

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

  // Generate instances for the next 4 weeks (28 days) in the USER's timezone.
  // The previous implementation used server-local time (setHours/setDate on a
  // server-local Date), so an 08:00 routine for an Eastern user landed at 03:00
  // and could be filed on the wrong calendar day. We resolve the day in the
  // user's tz and build each instant with fromZonedTime.
  const WEEKS = 4;
  const tz =
    (await prisma.user.findUnique({ where: { id: auth.userId }, select: { timezone: true } }))
      ?.timezone ?? 'America/New_York';
  const now = new Date();
  const nowLocal = toZonedTime(now, tz);
  const todayStamp = toUserDayStamp(now, tz); // YYYY-MM-DD in the user's tz
  const currentDayOfWeek = nowLocal.getDay(); // 0 = Sunday, in the user's tz

  const instancesToCreate: {
    userId: string;
    aimCategoryId: string;
    scheduledDate: Date;
    timeBlockStart: Date;
    timeBlockEnd: Date;
  }[] = [];

  for (const { dayOfWeek, timeStart } of days) {
    const [hours, minutes] = timeStart.split(':').map(Number);
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');

    for (let week = 0; week < WEEKS; week++) {
      // Calculate the date for this dayOfWeek in this week
      let daysUntil = dayOfWeek - currentDayOfWeek;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0 && week === 0) {
        // If today is the target day, include it only if the time hasn't passed
        // (compared in the user's local wall clock).
        const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
        const targetMinutes = hours * 60 + minutes;
        if (nowMinutes > targetMinutes) {
          daysUntil += 7; // Push to next week
        }
      }

      const targetStamp = shiftDayStamp(todayStamp, daysUntil + week * 7);
      // Wall-clock time interpreted in the user's tz → correct UTC instant.
      const blockStart = fromZonedTime(`${targetStamp}T${hh}:${mm}:00`, tz);
      const blockEnd = new Date(blockStart.getTime() + durationMin * 60000);

      instancesToCreate.push({
        userId: auth.userId,
        aimCategoryId,
        // Date-only anchor (UTC midnight of the user's local calendar date),
        // matching the convention used across the aim/calendar queries.
        scheduledDate: parseDateOnly(targetStamp)!,
        timeBlockStart: blockStart,
        timeBlockEnd: blockEnd,
      });
    }
  }

  // Idempotent (re-)scheduling: serialize per user+category, and replace this
  // category's future un-started instances rather than blindly appending — a
  // re-save or double-click previously duplicated every block for 4 weeks.
  // Only SCHEDULED (un-started) future instances are cleared; completed/missed
  // history and any started instance are preserved. The today-anchor is the
  // earliest day we generate, so we don't disturb earlier-today rows.
  const earliestStamp = toUserDayStamp(now, tz);
  const windowStart = parseDateOnly(earliestStamp)!;
  await advisoryLock(`aims-schedule:${auth.userId}:${aimCategoryId}`, async (tx) => {
    await tx.aimInstance.deleteMany({
      where: {
        userId: auth.userId,
        aimCategoryId,
        status: 'SCHEDULED',
        scheduledDate: { gte: windowStart },
      },
    });
    await tx.aimInstance.createMany({ data: instancesToCreate, skipDuplicates: true });
  });

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
