import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

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
      autoScheduleEnabled: true,
      taskSchedulePeriod: true,
      selectedCalendarIds: true,
      powerdownTime: true,
    },
  });

  return Response.json(user);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
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
      return Response.json(updated);
    }

    const created = await prisma.companySettings.create({
      data: { companyMtp },
    });
    return Response.json(created);
  }

  // User settings
  const { mtp, timezone, hasCompletedOnboarding, hiddenFeatures, notificationPrefs, autoScheduleEnabled, workingHoursStart, workingHoursEnd, casualHoursStart, casualHoursEnd, taskSchedulePeriod, selectedCalendarIds, powerdownTime } = body;

  const data: any = {};
  if (mtp !== undefined) data.mtp = mtp;
  if (timezone !== undefined) data.timezone = timezone;
  if (hasCompletedOnboarding !== undefined) data.hasCompletedOnboarding = hasCompletedOnboarding;
  if (hiddenFeatures !== undefined && Array.isArray(hiddenFeatures)) data.hiddenFeatures = hiddenFeatures;
  if (autoScheduleEnabled !== undefined) data.autoScheduleEnabled = autoScheduleEnabled;
  if (workingHoursStart !== undefined) data.workingHoursStart = workingHoursStart;
  if (workingHoursEnd !== undefined) data.workingHoursEnd = workingHoursEnd;
  if (casualHoursStart !== undefined) data.casualHoursStart = casualHoursStart;
  if (casualHoursEnd !== undefined) data.casualHoursEnd = casualHoursEnd;
  if (taskSchedulePeriod !== undefined) data.taskSchedulePeriod = taskSchedulePeriod;
  if (selectedCalendarIds !== undefined && Array.isArray(selectedCalendarIds)) data.selectedCalendarIds = selectedCalendarIds;
  if (powerdownTime !== undefined) data.powerdownTime = powerdownTime;

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

  return Response.json(user);
}
