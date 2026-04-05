import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateSettingsSchema } from '@/lib/schemas';
import { getGoogleSyncInfo, updateGoogleEvent } from '@/lib/calendar';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const USER_SETTINGS_SELECT = {
  mtp: true,
  timezone: true,
  hasCompletedOnboarding: true,
  hiddenFeatures: true,
  notificationPreference: true,
  workingHoursStart: true,
  workingHoursEnd: true,
  casualHoursStart: true,
  casualHoursEnd: true,
  taskSchedulePeriod: true,
  selectedCalendarIds: true,
  syncTargetCalendarId: true,
  calendarColorOverrides: true,
  powerdownTime: true,
  weeklyReviewDayOfWeek: true,
  weeklyReviewTime: true,
  weeklyReviewDuration: true,
  monthlyReviewRecurrenceRule: true,
  monthlyReviewTime: true,
  monthlyReviewDuration: true,
  yearlyReviewRecurrenceRule: true,
  yearlyReviewTime: true,
  yearlyReviewDuration: true,
  isPublicOnLeaderboard: true,
} as const;

const USER_UPDATABLE_FIELDS = [
  'mtp', 'hasCompletedOnboarding', 'hiddenFeatures',
  'workingHoursStart', 'workingHoursEnd', 'casualHoursStart', 'casualHoursEnd',
  'taskSchedulePeriod', 'selectedCalendarIds', 'syncTargetCalendarId', 'calendarColorOverrides', 'powerdownTime',
  'weeklyReviewDayOfWeek', 'weeklyReviewTime', 'weeklyReviewDuration',
  'monthlyReviewRecurrenceRule', 'monthlyReviewTime', 'monthlyReviewDuration',
  'yearlyReviewRecurrenceRule', 'yearlyReviewTime', 'yearlyReviewDuration',
  'isPublicOnLeaderboard',
];

const NOTIFICATION_PREF_FIELDS = [
  'emailEnabled', 'pushEnabled', 'derailingAlerts', 'mentionAlerts', 'reviewNags',
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');

  if (scope === 'company') {
    const settings = await prisma.companySettings.findFirst();
    return Response.json(settings ?? { companyMtp: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: USER_SETTINGS_SELECT,
  });

  return Response.json(user);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, updateSettingsSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  if (body.scope === 'company') {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);

    const { companyMtp } = body;
    const existing = await prisma.companySettings.findFirst();
    const result = existing
      ? await prisma.companySettings.update({ where: { id: existing.id }, data: { companyMtp } })
      : await prisma.companySettings.create({ data: { companyMtp } });
    return Response.json(result, NO_STORE);
  }

  // Build user update payload from defined fields
  const data: Prisma.UserUpdateInput = pickDefined(body, USER_UPDATABLE_FIELDS);

  if (body.timezone !== undefined) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
      data.timezone = body.timezone;
    } catch {
      return Response.json({ error: 'Invalid timezone' }, { status: 400 });
    }
  }

  // Fetch current powerdownTime before update for cascade comparison
  const oldUser = body.powerdownTime !== undefined
    ? await prisma.user.findUnique({ where: { id: auth.userId }, select: { powerdownTime: true, timezone: true } })
    : null;

  await prisma.user.update({
    where: { id: auth.userId },
    data,
  });

  // Cascade powerdownTime change to future sessions + GCal events
  if (body.powerdownTime !== undefined && oldUser && body.powerdownTime !== oldUser.powerdownTime) {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const cascadePowerdown = async () => {
      const now = new Date();
      const userTz = body.timezone ?? oldUser.timezone ?? 'America/New_York';
      const [pdH, pdM] = body.powerdownTime!.split(':').map(Number);

      // Find future sessions with GCal links
      const futureSessions = await prisma.powerdownSession.findMany({
        where: {
          userId: auth.userId,
          sessionDate: { gte: now },
          calendarEventId: { not: null },
        },
        select: { id: true, calendarEventId: true, sessionDate: true, timeBlockStart: true },
      });

      if (futureSessions.length === 0) return;

      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
      if (!hasGoogle) return;

      // Compute what the old default time would be to identify legacy sync-created overrides
      let oldDefaultStart: { hours: number; minutes: number } | null = null;
      if (oldUser.powerdownTime) {
        const [oldH, oldM] = oldUser.powerdownTime.split(':').map(Number);
        oldDefaultStart = { hours: oldH, minutes: oldM };
      }

      for (const session of futureSessions) {
        try {
          const zoned = toZonedTime(session.sessionDate, userTz);
          const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
          const newStart = fromZonedTime(`${dateKey}T${pad2(pdH)}:${pad2(pdM)}:00`, userTz);
          const newEnd = new Date(newStart.getTime() + 30 * 60_000);

          if (!session.timeBlockStart) {
            // Group A: sync-created session (post-fix) — no stored times, just update GCal
            await updateGoogleEvent(auth.userId, session.calendarEventId!, {
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
            }, targetCalendarId);
          } else if (oldDefaultStart) {
            // Group B: legacy sync-created session — check if stored time matches old default
            const storedZoned = toZonedTime(session.timeBlockStart, userTz);
            const matchesOldDefault =
              storedZoned.getHours() === oldDefaultStart.hours &&
              storedZoned.getMinutes() === oldDefaultStart.minutes;

            if (matchesOldDefault) {
              // Stale override from old sync — clear it and update GCal
              await prisma.powerdownSession.update({
                where: { id: session.id },
                data: { timeBlockStart: null, timeBlockEnd: null },
              });
              await updateGoogleEvent(auth.userId, session.calendarEventId!, {
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
              }, targetCalendarId);
            }
            // else: true user override — leave untouched
          }
        } catch {
          // Continue with other sessions
        }
      }
    };
    cascadePowerdown().catch(err => console.warn('[settings] powerdown cascade failed:', err));
  }

  // Update notification preferences (whitelist valid boolean fields only)
  if (body.notificationPrefs && typeof body.notificationPrefs === 'object') {
    const sanitized: Record<string, boolean> = {};
    for (const field of NOTIFICATION_PREF_FIELDS) {
      if (typeof body.notificationPrefs[field] === 'boolean') {
        sanitized[field] = body.notificationPrefs[field];
      }
    }
    if (Object.keys(sanitized).length > 0) {
      await prisma.notificationPreference.upsert({
        where: { userId: auth.userId },
        update: sanitized,
        create: { userId: auth.userId, ...sanitized },
      });
    }
  }

  const updatedUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: USER_SETTINGS_SELECT,
  });

  return Response.json(updatedUser, NO_STORE);
}
