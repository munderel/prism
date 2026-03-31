import { prisma } from '@/lib/prisma';
import { checkTaskDerailStatus } from '@/lib/derailing';
import { notifyUser } from '@/lib/notifications';

/**
 * Check for derailing tasks and send notifications.
 * Called on-demand from /api/tasks GET instead of a cron job.
 * Uses a simple time-based guard to avoid spamming notifications
 * on every request — only runs the check once per 30 minutes.
 */

let lastCheckTime = 0;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function checkDerailingTasks() {
  const now = Date.now();
  if (now - lastCheckTime < CHECK_INTERVAL_MS) return;
  lastCheckTime = now;

  try {
    const todayUTC = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);

    const tasks = await prisma.task.findMany({
      where: {
        dueDate: { gte: todayUTC, lt: tomorrowUTC },
        status: { notIn: ['DONE', 'DROPPED'] },
      },
      include: {
        owner: { select: { id: true, timezone: true } },
      },
    });

    const derailingTasks = tasks.filter(
      (task) => checkTaskDerailStatus(task, task.owner.timezone) === 'derailing'
    );

    if (derailingTasks.length === 0) return;

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
  } catch (error) {
    console.error('[derailing-checker] Error:', error);
  }
}
