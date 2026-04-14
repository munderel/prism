import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateSettingsSchema } from '@/lib/schemas';
import { getGoogleSyncInfo, updateGoogleEvent } from '@/lib/calendar';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { matchesMonthlyRule, matchesYearlyRule } from '@/lib/review-dates';
import { pad2, getDateKey } from '@/lib/google-sync-state';

const USER_SETTINGS_SELECT = {
  name: true,
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
  weeklyTargetCalendarIds: true,
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
  streakCountAims: true,
  streakCountProcesses: true,
  streakCountReviews: true,
  streakCountPowerdown: true,
  beeminderAuthToken: true,
  beeminderGoalSlug: true,
} as const;

const USER_UPDATABLE_FIELDS = [
  'name', 'mtp', 'hasCompletedOnboarding', 'hiddenFeatures',
  'workingHoursStart', 'workingHoursEnd', 'casualHoursStart', 'casualHoursEnd',
  'taskSchedulePeriod', 'selectedCalendarIds', 'syncTargetCalendarId', 'calendarColorOverrides', 'weeklyTargetCalendarIds', 'powerdownTime',
  'weeklyReviewDayOfWeek', 'weeklyReviewTime', 'weeklyReviewDuration',
  'monthlyReviewRecurrenceRule', 'monthlyReviewTime', 'monthlyReviewDuration',
  'yearlyReviewRecurrenceRule', 'yearlyReviewTime', 'yearlyReviewDuration',
  'isPublicOnLeaderboard',
  'streakCountAims', 'streakCountProcesses', 'streakCountReviews', 'streakCountPowerdown',
  'beeminderAuthToken', 'beeminderGoalSlug',
];

const NOTIFICATION_PREF_FIELDS = [
  'emailEnabled', 'pushEnabled', 'derailingAlerts', 'mentionAlerts', 'reviewNags',
] as const;

function buildZonedWindow(dateKey: string, time: string, duration: number, timezone: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const start = fromZonedTime(`${dateKey}T${pad2(hours)}:${pad2(minutes)}:00`, timezone);
  const end = new Date(start.getTime() + duration * 60_000);
  return { start, end };
}

function reviewMatchesCadence(
  reviewType: 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  scheduledDate: Date,
  config: {
    timezone: string;
    weeklyReviewDayOfWeek?: number | null;
    monthlyReviewRecurrenceRule?: string | null;
    yearlyReviewRecurrenceRule?: string | null;
  },
) {
  const zoned = toZonedTime(scheduledDate, config.timezone);

  switch (reviewType) {
    case 'WEEKLY':
      return config.weeklyReviewDayOfWeek != null && zoned.getDay() === config.weeklyReviewDayOfWeek;
    case 'MONTHLY':
      return !!config.monthlyReviewRecurrenceRule && matchesMonthlyRule(zoned, config.monthlyReviewRecurrenceRule);
    case 'YEARLY':
      return !!config.yearlyReviewRecurrenceRule && matchesYearlyRule(zoned, config.yearlyReviewRecurrenceRule);
    default:
      return false;
  }
}

function getReviewConfig(
  reviewType: 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  config: {
    timezone: string;
    weeklyReviewDayOfWeek?: number | null;
    weeklyReviewTime?: string | null;
    weeklyReviewDuration?: number | null;
    monthlyReviewRecurrenceRule?: string | null;
    monthlyReviewTime?: string | null;
    monthlyReviewDuration?: number | null;
    yearlyReviewRecurrenceRule?: string | null;
    yearlyReviewTime?: string | null;
    yearlyReviewDuration?: number | null;
  },
) {
  switch (reviewType) {
    case 'WEEKLY':
      return config.weeklyReviewTime
        ? { time: config.weeklyReviewTime, duration: config.weeklyReviewDuration ?? 60 }
        : null;
    case 'MONTHLY':
      return config.monthlyReviewTime && config.monthlyReviewRecurrenceRule
        ? { time: config.monthlyReviewTime, duration: config.monthlyReviewDuration ?? 60 }
        : null;
    case 'YEARLY':
      return config.yearlyReviewTime && config.yearlyReviewRecurrenceRule
        ? { time: config.yearlyReviewTime, duration: config.yearlyReviewDuration ?? 90 }
        : null;
    default:
      return null;
  }
}

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

  const shouldCascadeRecurringSettings = [
    'powerdownTime',
    'weeklyReviewDayOfWeek',
    'weeklyReviewTime',
    'weeklyReviewDuration',
    'monthlyReviewRecurrenceRule',
    'monthlyReviewTime',
    'monthlyReviewDuration',
    'yearlyReviewRecurrenceRule',
    'yearlyReviewTime',
    'yearlyReviewDuration',
    'timezone',
  ].some((field) => field in body);

  const oldUser = shouldCascadeRecurringSettings
    ? await prisma.user.findUnique({
        where: { id: auth.userId },
        select: {
          powerdownTime: true,
          timezone: true,
          weeklyReviewDayOfWeek: true,
          weeklyReviewTime: true,
          weeklyReviewDuration: true,
          monthlyReviewRecurrenceRule: true,
          monthlyReviewTime: true,
          monthlyReviewDuration: true,
          yearlyReviewRecurrenceRule: true,
          yearlyReviewTime: true,
          yearlyReviewDuration: true,
        },
      })
    : null;

  await prisma.user.update({
    where: { id: auth.userId },
    data,
  });

  // Cascade powerdownTime change to future sessions + GCal events
  if (body.powerdownTime !== undefined && oldUser && body.powerdownTime !== oldUser.powerdownTime) {
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

  const reviewSettingsChanged = oldUser && (
    body.timezone !== undefined ||
    body.weeklyReviewDayOfWeek !== undefined ||
    body.weeklyReviewTime !== undefined ||
    body.weeklyReviewDuration !== undefined ||
    body.monthlyReviewRecurrenceRule !== undefined ||
    body.monthlyReviewTime !== undefined ||
    body.monthlyReviewDuration !== undefined ||
    body.yearlyReviewRecurrenceRule !== undefined ||
    body.yearlyReviewTime !== undefined ||
    body.yearlyReviewDuration !== undefined
  );

  if (reviewSettingsChanged && oldUser) {
    const cascadeReviews = async () => {
      const now = new Date();
      const previousConfig = {
        timezone: oldUser.timezone ?? 'America/New_York',
        weeklyReviewDayOfWeek: oldUser.weeklyReviewDayOfWeek,
        weeklyReviewTime: oldUser.weeklyReviewTime,
        weeklyReviewDuration: oldUser.weeklyReviewDuration,
        monthlyReviewRecurrenceRule: oldUser.monthlyReviewRecurrenceRule,
        monthlyReviewTime: oldUser.monthlyReviewTime,
        monthlyReviewDuration: oldUser.monthlyReviewDuration,
        yearlyReviewRecurrenceRule: oldUser.yearlyReviewRecurrenceRule,
        yearlyReviewTime: oldUser.yearlyReviewTime,
        yearlyReviewDuration: oldUser.yearlyReviewDuration,
      };
      const nextConfig = {
        timezone: body.timezone ?? previousConfig.timezone,
        weeklyReviewDayOfWeek: body.weeklyReviewDayOfWeek ?? previousConfig.weeklyReviewDayOfWeek,
        weeklyReviewTime: body.weeklyReviewTime ?? previousConfig.weeklyReviewTime,
        weeklyReviewDuration: body.weeklyReviewDuration ?? previousConfig.weeklyReviewDuration,
        monthlyReviewRecurrenceRule: body.monthlyReviewRecurrenceRule ?? previousConfig.monthlyReviewRecurrenceRule,
        monthlyReviewTime: body.monthlyReviewTime ?? previousConfig.monthlyReviewTime,
        monthlyReviewDuration: body.monthlyReviewDuration ?? previousConfig.monthlyReviewDuration,
        yearlyReviewRecurrenceRule: body.yearlyReviewRecurrenceRule ?? previousConfig.yearlyReviewRecurrenceRule,
        yearlyReviewTime: body.yearlyReviewTime ?? previousConfig.yearlyReviewTime,
        yearlyReviewDuration: body.yearlyReviewDuration ?? previousConfig.yearlyReviewDuration,
      };

      const futureReviews = await prisma.review.findMany({
        where: {
          userId: auth.userId,
          isTeamReview: false,
          completedAt: null,
          scheduledDate: { gte: now },
          reviewType: { in: ['WEEKLY', 'MONTHLY', 'YEARLY'] },
        },
        select: {
          id: true,
          reviewType: true,
          scheduledDate: true,
          timeBlockStart: true,
          timeBlockEnd: true,
          calendarEventId: true,
        },
      });

      if (futureReviews.length === 0) return;

      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);

      for (const review of futureReviews) {
        const reviewType = review.reviewType as 'WEEKLY' | 'MONTHLY' | 'YEARLY';
        if (!reviewMatchesCadence(reviewType, review.scheduledDate, previousConfig)) continue;
        if (!reviewMatchesCadence(reviewType, review.scheduledDate, nextConfig)) continue;

        const prevTiming = getReviewConfig(reviewType, previousConfig);
        const nextTiming = getReviewConfig(reviewType, nextConfig);
        if (!prevTiming || !nextTiming) continue;

        const previousDateKey = getDateKey(review.scheduledDate, previousConfig.timezone);
        const nextDateKey = getDateKey(review.scheduledDate, nextConfig.timezone);
        const previousWindow = buildZonedWindow(previousDateKey, prevTiming.time, prevTiming.duration, previousConfig.timezone);
        const nextWindow = buildZonedWindow(nextDateKey, nextTiming.time, nextTiming.duration, nextConfig.timezone);

        const matchesPreviousDefault =
          !!review.timeBlockStart &&
          !!review.timeBlockEnd &&
          Math.abs(review.timeBlockStart.getTime() - previousWindow.start.getTime()) < 60000 &&
          Math.abs(review.timeBlockEnd.getTime() - previousWindow.end.getTime()) < 60000;

        if (!matchesPreviousDefault) continue;

        await prisma.review.update({
          where: { id: review.id },
          data: {
            timeBlockStart: nextWindow.start,
            timeBlockEnd: nextWindow.end,
          },
        });

        if (review.calendarEventId && hasGoogle) {
          await updateGoogleEvent(auth.userId, review.calendarEventId, {
            start: nextWindow.start.toISOString(),
            end: nextWindow.end.toISOString(),
          }, targetCalendarId).catch(() => {});
        }
      }
    };

    cascadeReviews().catch(err => console.warn('[settings] review cascade failed:', err));
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
