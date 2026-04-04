import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { getEffectiveDuration, getEffectiveFrequency, type UserAimLike } from '@/lib/aim-phases';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Get current week boundaries (Monday-Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get only explicitly active user aims (no auto-include of default categories)
  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: { aimCategory: true },
  });

  const activeAims = userAims.map((ua) => ({
    aimCategoryId: ua.aimCategoryId,
    aimCategory: ua.aimCategory,
    customFrequency: ua.customFrequency,
    customDuration: ua.customDuration,
    currentPhase: ua.currentPhase,
    phaseStartedAt: ua.phaseStartedAt,
  }));

  const existingInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      scheduledDate: { gte: weekStart, lte: weekEnd },
    },
    include: { aimCategory: true },
  });

  interface UnscheduledItem {
    id: string;
    type: 'aim';
    title: string;
    aimCategoryId: string;
    aimInstanceId?: string;
    duration: number;
    source: 'aims';
    activities: string[] | null;
  }

  const items: UnscheduledItem[] = [];

  for (const aim of activeAims) {
    const userAimLike: UserAimLike = {
      customDuration: aim.customDuration,
      customFrequency: aim.customFrequency,
      currentPhase: aim.currentPhase,
      phaseStartedAt: aim.phaseStartedAt,
      aimCategory: {
        defaultDurationMin: aim.aimCategory.defaultDurationMin,
        defaultFrequency: aim.aimCategory.defaultFrequency,
      },
    };
    const frequency = getEffectiveFrequency(userAimLike);
    const duration = getEffectiveDuration(userAimLike);
    const activities = Array.isArray(aim.aimCategory.activities)
      ? aim.aimCategory.activities as string[]
      : null;

    const categoryInstances = existingInstances.filter(
      (i) => i.aimCategoryId === aim.aimCategoryId
    );

    // Existing instances without time blocks (need scheduling)
    for (const inst of categoryInstances) {
      if (!inst.timeBlockStart && inst.status === 'SCHEDULED') {
        items.push({
          id: `aim-instance-${inst.id}`,
          type: 'aim',
          title: aim.aimCategory.name,
          aimCategoryId: aim.aimCategoryId,
          aimInstanceId: inst.id,
          duration,
          source: 'aims',
          activities,
        });
      }
    }

    // Missing instances (frequency not met yet)
    const missing = Math.max(0, frequency - categoryInstances.length);
    for (let i = 0; i < missing; i++) {
      items.push({
        id: `aim-new-${aim.aimCategoryId}-${i}`,
        type: 'aim',
        title: aim.aimCategory.name,
        aimCategoryId: aim.aimCategoryId,
        duration,
        source: 'aims',
        activities,
      });
    }
  }

  // Add index labels like "(1 of 3)" when there are multiple items for one aim
  const countByCategory: Record<string, number> = {};
  for (const item of items) {
    countByCategory[item.aimCategoryId] = (countByCategory[item.aimCategoryId] || 0) + 1;
  }
  const indexByCategory: Record<string, number> = {};
  for (const item of items) {
    const total = countByCategory[item.aimCategoryId];
    if (total > 1) {
      indexByCategory[item.aimCategoryId] = (indexByCategory[item.aimCategoryId] || 0) + 1;
      item.title = `${item.title} (${indexByCategory[item.aimCategoryId]} of ${total})`;
    }
  }

  return Response.json(items);
}
