import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { getEffectiveDuration, getEffectiveFrequency, type UserAimLike } from '@/lib/aim-phases';
import { weekBoundariesForUser } from '@/lib/user-timezone';

// Statuses that consume one of the weekly frequency slots. SKIPPED and MISSED
// instances must NOT consume a slot — otherwise the aim disappears from the
// Calendar sidebar after a single skip and the user can't re-schedule.
const COUNTING_STATUSES = new Set(['SCHEDULED', 'COMPLETED']);

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? 'America/New_York';

  // Monday-start week in the user's local timezone (matches prior behavior;
  // there is no per-user weekStartDay outside GoalStack).
  const { start: weekStart, end: weekEnd } = weekBoundariesForUser(new Date(), tz, 1);

  const userAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: { aimCategory: true },
  });

  const existingInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      scheduledDate: { gte: weekStart, lt: weekEnd },
    },
  });

  interface UnscheduledItem {
    id: string;
    type: 'aim';
    title: string;
    aimCategoryId: string;
    aimInstanceId?: string;
    duration: number;
    slotIndex: number;
    slotTotal: number;
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

    // Only SCHEDULED + COMPLETED instances count toward the weekly target.
    const counting = categoryInstances.filter((i) => COUNTING_STATUSES.has(i.status));
    // Unplaced = exists but no time block yet. Surface these first so the drop
    // handler PATCHes the existing row instead of creating a duplicate.
    const unplaced = counting.filter((i) => !i.timeBlockStart && i.status === 'SCHEDULED');
    const missing = Math.max(0, frequency - counting.length);
    const slotTotal = unplaced.length + missing;
    if (slotTotal === 0) continue;

    let slotIndex = 0;
    for (const inst of unplaced) {
      slotIndex += 1;
      items.push({
        id: `aim-${aim.aimCategoryId}-i-${inst.id}`,
        type: 'aim',
        title: aim.aimCategory.name,
        aimCategoryId: aim.aimCategoryId,
        aimInstanceId: inst.id,
        duration,
        slotIndex,
        slotTotal,
        source: 'aims',
        activities,
      });
    }
    for (let k = 0; k < missing; k++) {
      slotIndex += 1;
      items.push({
        id: `aim-${aim.aimCategoryId}-new-${k}`,
        type: 'aim',
        title: aim.aimCategory.name,
        aimCategoryId: aim.aimCategoryId,
        duration,
        slotIndex,
        slotTotal,
        source: 'aims',
        activities,
      });
    }
  }

  return Response.json(items);
}
