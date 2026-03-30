import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, updateSettingsSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope'); // 'user' | 'company'

  if (scope === 'company') {
    const settings = await prisma.companySettings.findFirst();
    return Response.json(settings ?? { companyMtp: null });
  }

  // User settings
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
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
    },
  });

  return Response.json(user);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, updateSettingsSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { scope } = body;

  if (scope === 'company') {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);

    const { companyMtp } = body;
    const existing = await prisma.companySettings.findFirst();

    if (existing) {
      const updated = await prisma.companySettings.update({
        where: { id: existing.id },
        data: { companyMtp },
      });
      return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
    }

    const created = await prisma.companySettings.create({
      data: { companyMtp },
    });
    return Response.json(created, { headers: { 'Cache-Control': 'no-store' } });
  }

  // User settings
  const { mtp, timezone, hasCompletedOnboarding, hiddenFeatures, notificationPrefs, workingHoursStart, workingHoursEnd, casualHoursStart, casualHoursEnd, taskSchedulePeriod, selectedCalendarIds, powerdownTime, weeklyReviewDayOfWeek, weeklyReviewTime, weeklyReviewDuration, monthlyReviewRecurrenceRule, monthlyReviewTime, monthlyReviewDuration, yearlyReviewRecurrenceRule, yearlyReviewTime, yearlyReviewDuration, isPublicOnLeaderboard } = body;

  const data: Prisma.UserUpdateInput = {};
  if (mtp !== undefined) data.mtp = mtp;
  if (timezone !== undefined) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      data.timezone = timezone;
    } catch {
      return Response.json({ error: 'Invalid timezone' }, { status: 400 });
    }
  }
  if (hasCompletedOnboarding !== undefined) data.hasCompletedOnboarding = hasCompletedOnboarding;
  if (hiddenFeatures !== undefined) data.hiddenFeatures = hiddenFeatures;
  if (workingHoursStart !== undefined) data.workingHoursStart = workingHoursStart;
  if (workingHoursEnd !== undefined) data.workingHoursEnd = workingHoursEnd;
  if (casualHoursStart !== undefined) data.casualHoursStart = casualHoursStart;
  if (casualHoursEnd !== undefined) data.casualHoursEnd = casualHoursEnd;
  if (taskSchedulePeriod !== undefined) data.taskSchedulePeriod = taskSchedulePeriod;
  if (selectedCalendarIds !== undefined) data.selectedCalendarIds = selectedCalendarIds;
  if (powerdownTime !== undefined) data.powerdownTime = powerdownTime;
  if (weeklyReviewDayOfWeek !== undefined) data.weeklyReviewDayOfWeek = weeklyReviewDayOfWeek;
  if (weeklyReviewTime !== undefined) data.weeklyReviewTime = weeklyReviewTime;
  if (weeklyReviewDuration !== undefined) data.weeklyReviewDuration = weeklyReviewDuration;
  if (monthlyReviewRecurrenceRule !== undefined) data.monthlyReviewRecurrenceRule = monthlyReviewRecurrenceRule;
  if (monthlyReviewTime !== undefined) data.monthlyReviewTime = monthlyReviewTime;
  if (monthlyReviewDuration !== undefined) data.monthlyReviewDuration = monthlyReviewDuration;
  if (yearlyReviewRecurrenceRule !== undefined) data.yearlyReviewRecurrenceRule = yearlyReviewRecurrenceRule;
  if (yearlyReviewTime !== undefined) data.yearlyReviewTime = yearlyReviewTime;
  if (yearlyReviewDuration !== undefined) data.yearlyReviewDuration = yearlyReviewDuration;
  if (isPublicOnLeaderboard !== undefined) data.isPublicOnLeaderboard = isPublicOnLeaderboard;

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { mtp: true, timezone: true, hasCompletedOnboarding: true, hiddenFeatures: true },
  });

  // Update notification preferences (whitelist valid boolean fields only)
  if (notificationPrefs && typeof notificationPrefs === 'object') {
    const allowedFields = ['emailEnabled', 'pushEnabled', 'derailingAlerts', 'mentionAlerts', 'reviewNags'] as const;
    const sanitized: Record<string, boolean> = {};
    for (const field of allowedFields) {
      if (typeof notificationPrefs[field] === 'boolean') {
        sanitized[field] = notificationPrefs[field];
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

  return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
}
