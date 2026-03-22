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

  let notified = 0;

  for (const task of tasks) {
    const status = checkTaskDerailStatus(task, task.owner.timezone);

    if (status === 'derailing') {
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId: task.owner.id },
      });

      if (!prefs || prefs.derailingAlerts) {
        await notifyUser(
          task.owner.id,
          'Task Derailing!',
          `"${task.title}" is past 6pm and not done. Take action now.`,
          '/tasks'
        );
        notified++;
      }
    }
  }

  return Response.json({ ok: true, checked: tasks.length, notified });
}
