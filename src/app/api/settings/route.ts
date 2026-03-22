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
      notificationPreference: true,
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
  const { mtp, timezone, hasCompletedOnboarding, notificationPrefs } = body;

  const data: any = {};
  if (mtp !== undefined) data.mtp = mtp;
  if (timezone !== undefined) data.timezone = timezone;
  if (hasCompletedOnboarding !== undefined) data.hasCompletedOnboarding = hasCompletedOnboarding;

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { mtp: true, timezone: true, hasCompletedOnboarding: true },
  });

  // Update notification preferences
  if (notificationPrefs) {
    await prisma.notificationPreference.upsert({
      where: { userId: auth.userId },
      update: notificationPrefs,
      create: { userId: auth.userId, ...notificationPrefs },
    });
  }

  return Response.json(user);
}
