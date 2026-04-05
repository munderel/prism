import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { checkTaskDerailStatus } from '@/lib/derailing';
import { notifyUser } from '@/lib/notifications';
import { toZonedTime } from 'date-fns-tz';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        dueDate: { not: null },
        status: { notIn: ['DONE', 'DROPPED'] },
      },
      include: {
        owner: { select: { id: true, timezone: true } },
      },
    });

    const derailingTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const timezone = task.owner.timezone || 'America/New_York';
      const dueLocal = toZonedTime(task.dueDate, timezone);
      const nowLocal = toZonedTime(new Date(), timezone);
      const sameLocalDay =
        dueLocal.getFullYear() === nowLocal.getFullYear() &&
        dueLocal.getMonth() === nowLocal.getMonth() &&
        dueLocal.getDate() === nowLocal.getDate();

      return sameLocalDay && checkTaskDerailStatus(task, timezone) === 'derailing';
    });

    // Batch-fetch notification preferences for all derailing task owners
    const ownerIds = Array.from(new Set(derailingTasks.map((t) => t.owner.id)));
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: ownerIds } },
    });
    const prefsMap = new Map(prefs.map((p) => [p.userId, p]));

    const notifications = derailingTasks
      .filter((task) => {
        const pref = prefsMap.get(task.owner.id);
        return !pref || pref.derailingAlerts;
      })
      .map((task) =>
        notifyUser(
          task.owner.id,
          'Task Derailing!',
          `"${task.title}" is past 6pm and not done. Take action now.`,
          '/tasks'
        )
      );

    await Promise.all(notifications);

    return Response.json({ ok: true, checked: tasks.length, notified: notifications.length });
  } catch (error) {
    console.error('[cron/derailing] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
