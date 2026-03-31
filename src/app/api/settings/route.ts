import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateSettingsSchema } from '@/lib/schemas';

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
  'taskSchedulePeriod', 'selectedCalendarIds', 'powerdownTime',
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

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { mtp: true, timezone: true, hasCompletedOnboarding: true, hiddenFeatures: true },
  });

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

  return Response.json(user, NO_STORE);
}
