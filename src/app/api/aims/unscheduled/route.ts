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

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: { aimCategory: true },
  });

  const existingInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      scheduledDate: { gte: weekStart, lte: weekEnd },
    },
  });

  interface UnscheduledItem {
    id: string;
    type: 'aim';
    title: string;
    aimCategoryId: string;
    aimInstanceId?: string;
    duration: number;
    remaining: number;
    source: 'aims';
    activities: string[] | null;
  }

  const items: UnscheduledItem[] = [];

  for (const aim of userAims) {
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

    // "Remaining" = existing AimInstances that have no time block yet (SCHEDULED
    // but unplaced) + missing instances needed to reach the weekly target.
    const existingNoTimeBlock = categoryInstances.filter(
      (i) => !i.timeBlockStart && i.status === 'SCHEDULED'
    );
    const missing = Math.max(0, frequency - categoryInstances.length);
    const remaining = existingNoTimeBlock.length + missing;
    if (remaining === 0) continue;

    // Prefer to attach the first existing-without-timeBlock instance id so the
    // drop handler PATCHes it (adding a time block) instead of creating a new
    // AimInstance row. Once consumed, the next refresh will surface the next
    // candidate (or fall back to POST-creating new instances).
    const nextInstanceId = existingNoTimeBlock[0]?.id;

    items.push({
      id: `aim-${aim.aimCategoryId}`,
      type: 'aim',
      title: aim.aimCategory.name,
      aimCategoryId: aim.aimCategoryId,
      aimInstanceId: nextInstanceId,
      duration,
      remaining,
      source: 'aims',
      activities,
    });
  }

  return Response.json(items);
}
