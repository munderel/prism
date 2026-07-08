import { NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { checkTaskDerailStatus } from '@/lib/derailing';
import { checkAndBreakMissedStreaks } from '@/lib/streak-engine';
import { notifyUser } from '@/lib/notifications';
import { toUserDayStamp, dstSafeDate } from '@/lib/user-timezone';
import { NotificationType } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import { reportError } from '@/lib/error-reporter';

const log = createLogger('cron/derailing');

// Bound the Vercel function so a growing user base can't silently overrun the
// default timeout mid-run (mirrors the google-sync cron's budget).
export const maxDuration = 60;

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

    const now = new Date();

    const derailingTasks = tasks.filter((task) => {
      const timezone = task.owner.timezone || 'America/New_York';
      // checkTaskDerailStatus already does the (timezone-correct) due-today
      // check via toTaskDueDateKey; the old duplicated toZonedTime(dueDate)
      // same-day block here shifted date-only tasks back a day and silently
      // suppressed every derail notification for non-UTC users.
      return checkTaskDerailStatus(task, timezone) === 'derailing';
    });

    // Dedup: notify each derailing task at most once per the owner's LOCAL day.
    // The cron fires hourly 18:00–23:00, so without this a still-derailing task
    // produced up to ~6 duplicate push+email+inbox alerts per evening.
    const toNotify = derailingTasks.filter((task) => {
      const timezone = task.owner.timezone || 'America/New_York';
      const localDayStart = dstSafeDate(toUserDayStamp(now, timezone), timezone);
      return !task.lastDerailNotifiedAt || task.lastDerailNotifiedAt < localDayStart;
    });

    const notifications = toNotify.map((task) =>
      notifyUser(
        task.owner.id,
        'Task Derailing!',
        `"${task.title}" is past 6pm and not done. Take action now.`,
        '/tasks',
        NotificationType.DERAILING,
      ),
    );

    // allSettled — one user's failed lookup/notify must not abort the whole
    // run and skip the streak loop below for everyone else.
    await Promise.allSettled(notifications);

    // Mark the notified tasks so a later fire today won't re-alert them.
    if (toNotify.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: toNotify.map((t) => t.id) } },
        data: { lastDerailNotifiedAt: now },
      });
    }

    // Check and break streaks for missed AIMs, Processes, Reviews
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    let streaksBroken = 0;
    for (const user of allUsers) {
      const breaks = await checkAndBreakMissedStreaks(user.id);
      streaksBroken += breaks.length;
    }

    const summary = { checked: tasks.length, derailing: derailingTasks.length, notified: toNotify.length, streaksBroken };
    log.info('run complete', summary);
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    await reportError('cron/derailing', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
