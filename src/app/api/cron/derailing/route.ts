import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { checkTaskDerailStatus } from '@/lib/derailing';
import { notifyUser } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find all tasks due today that are not done
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: today, lt: tomorrow },
      status: { notIn: ['DONE', 'DROPPED'] },
    },
    include: {
      owner: { select: { id: true, timezone: true } },
    },
  });

  // Process all tasks in parallel instead of sequentially
  const derailingTasks = tasks.filter(
    (task) => checkTaskDerailStatus(task, task.owner.timezone) === 'derailing'
  );

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
}
