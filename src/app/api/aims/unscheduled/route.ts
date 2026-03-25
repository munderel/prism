import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Get current week boundaries (Monday–Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get all active user aims
  const activeAims = await prisma.userAim.findMany({
    where: { userId: auth.userId, isActive: true },
    include: { aimCategory: true },
  });

  // Get existing instances for this week
  const existingInstances = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      scheduledDate: { gte: weekStart, lte: weekEnd },
    },
    include: { aimCategory: true },
  });

  const items: Array<{
    id: string;
    type: 'aim';
    title: string;
    aimCategoryId: string;
    aimInstanceId?: string;
    duration: number;
    source: 'aims';
  }> = [];

  for (const ua of activeAims) {
    const frequency = ua.customFrequency ?? ua.aimCategory.defaultFrequency;
    const duration = ua.customDuration ?? ua.aimCategory.defaultDurationMin;
    const categoryInstances = existingInstances.filter(
      (i) => i.aimCategoryId === ua.aimCategoryId
    );

    // Existing instances without time blocks (need scheduling)
    const unscheduledInstances = categoryInstances.filter(
      (i) => !i.timeBlockStart && i.status === 'SCHEDULED'
    );
    for (const inst of unscheduledInstances) {
      items.push({
        id: `aim-instance-${inst.id}`,
        type: 'aim',
        title: `${ua.aimCategory.name}`,
        aimCategoryId: ua.aimCategoryId,
        aimInstanceId: inst.id,
        duration,
        source: 'aims',
      });
    }

    // Missing instances (frequency not met yet)
    const totalExisting = categoryInstances.length;
    const missing = Math.max(0, frequency - totalExisting);
    for (let i = 0; i < missing; i++) {
      items.push({
        id: `aim-new-${ua.aimCategoryId}-${i}`,
        type: 'aim',
        title: `${ua.aimCategory.name}`,
        aimCategoryId: ua.aimCategoryId,
        duration,
        source: 'aims',
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
