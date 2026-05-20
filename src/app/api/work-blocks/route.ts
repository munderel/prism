import { NextRequest } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, requireTaskAccess } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createWorkBlockSchema } from '@/lib/schemas';
import { createGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';
import { buildWorkBlockEventBody } from '@/lib/work-block-sync';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const taskId = searchParams.get('taskId');
  const date = searchParams.get('date'); // YYYY-MM-DD — convenience for powerdown "today"
  const tzParam = searchParams.get('tz');

  const where: Record<string, unknown> = { userId: auth.userId };
  if (taskId) where.taskId = taskId;

  if (date) {
    // Compute the day window in the user's timezone — not the server's local
    // time. Falls back to the user's stored preference, then UTC. Without this
    // a Toronto user on a UTC server sees a window shifted by 4–5 hours.
    let tz = tzParam ?? undefined;
    if (!tz) {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { timezone: true },
      });
      tz = user?.timezone ?? 'UTC';
    }
    const day = fromZonedTime(`${date}T00:00:00`, tz);
    const next = fromZonedTime(`${date}T00:00:00`, tz);
    next.setUTCDate(next.getUTCDate() + 1);
    where.start = { gte: day, lt: next };
  } else if (start && end) {
    where.start = { gte: new Date(start), lt: new Date(end) };
  }

  const blocks = await prisma.workBlock.findMany({
    where,
    orderBy: { start: 'asc' },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return Response.json(blocks, NO_STORE);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createWorkBlockSchema);
  if ('error' in parsed) return parsed.error;
  const { taskId, start, end, mainObjective, clearGoals } = parsed.data;

  // Authorize via the shared helper (owner or assignee or admin).
  const taskAccess = await requireTaskAccess(taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  // Schema already enforces ISO datetime + end > start + duration cap. No
  // further validation needed here.
  const startDate = new Date(start);
  const endDate = new Date(end);

  const block = await prisma.workBlock.create({
    data: {
      taskId,
      userId: auth.userId,
      start: startDate,
      end: endDate,
      mainObjective: mainObjective.trim(),
    },
  });

  if (clearGoals && clearGoals.length > 0) {
    // Determine starting sortOrder to append after any existing task-level clear goals
    const maxOrder = await prisma.clearGoal.aggregate({
      where: { taskId },
      _max: { sortOrder: true },
    });
    const baseOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    await prisma.clearGoal.createMany({
      data: clearGoals.map((text, idx) => ({
        taskId,
        workBlockId: block.id,
        text: text.trim(),
        sortOrder: baseOrder + idx,
      })),
    });
  }

  const full = await prisma.workBlock.findUnique({
    where: { id: block.id },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
  });

  // Sync to Google Calendar. Awaited so the response reflects the post-sync
  // state — background promises don't survive Vercel's function suspend
  // after Response.json. Mirrors meetings/route.ts: persist syncedAt on
  // success and syncError on failure so the UI can show a red chip with Retry.
  const taskTitle = full?.task?.title ?? 'Work block';
  const syncToGcal = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
    if (!hasGoogle) {
      return { ok: false, error: 'Google Calendar is not connected. Reconnect in Settings.' };
    }
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? 'America/New_York';
    const { summary, description } = buildWorkBlockEventBody({
      taskTitle,
      mainObjective: block.mainObjective,
    });
    try {
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary,
        description,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeZone: tz,
        prismType: 'workblock',
        prismRecordId: block.id,
      }, targetCalendarId);
      if (!gcalEvent?.id) {
        return { ok: false, error: 'Google did not return an event id. Check calendar permissions.' };
      }
      await prisma.workBlock.update({
        where: { id: block.id },
        data: { calendarEventId: gcalEvent.id, syncedAt: new Date(), syncError: null },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Google Calendar error';
      return { ok: false, error: message };
    }
  };
  const syncResult = await syncToGcal();
  if (!syncResult.ok) {
    console.warn('[work-blocks] Google Calendar sync failed:', syncResult.error);
    await prisma.workBlock.update({
      where: { id: block.id },
      data: { syncError: syncResult.error, syncedAt: null },
    }).catch((err) => console.error('[work-blocks] failed to persist syncError', err));
  }

  // Re-fetch so the response carries the post-sync state (calendarEventId,
  // syncedAt, syncError).
  const refreshed = await prisma.workBlock.findUnique({
    where: { id: block.id },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
  });
  return Response.json(refreshed ?? full, { status: 201, ...NO_STORE });
}
