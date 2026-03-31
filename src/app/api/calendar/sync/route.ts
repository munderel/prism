import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents } from '@/lib/calendar';

type GCalEntry = { start: string; end: string; summary: string; status: string };

/** Check if a GCal event's time differs from a Prism item's time by more than 1 minute. */
function hasTimeDrifted(
  gcalStart: Date,
  gcalEnd: Date,
  prismStart: Date | null,
  prismEnd: Date | null,
): boolean {
  if (!prismStart || !prismEnd) return false;
  return (
    Math.abs(gcalStart.getTime() - prismStart.getTime()) > 60000 ||
    Math.abs(gcalEnd.getTime() - prismEnd.getTime()) > 60000
  );
}

/**
 * POST /api/calendar/sync
 * Pull latest changes from Google Calendar and sync to Prism.
 * Auto-applies GCal changes to Prism tasks/reviews without confirmation.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { start, end } = parsed.data;
  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { selectedCalendarIds: true },
  });

  const rawIds = Array.isArray(user?.selectedCalendarIds) ? (user.selectedCalendarIds as string[]) : [];
  const calendarIds = rawIds.length > 0 ? rawIds : undefined;

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  const [gcalEvents, tasks, aimInstances, reviews] = await Promise.all([
    listGoogleEvents(auth.userId, start, end, calendarIds),
    prisma.task.findMany({
      where: {
        ownerId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true, title: true },
    }),
    prisma.aimInstance.findMany({
      where: {
        userId: auth.userId,
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, timeBlockStart: true, timeBlockEnd: true },
    }),
    prisma.review.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true },
    }),
  ]);

  // Build lookup of GCal events by ID
  const gcalMap = new Map<string, GCalEntry>();
  for (const event of gcalEvents) {
    if (event.id) {
      gcalMap.set(event.id, {
        start: event.start?.dateTime ?? event.start?.date ?? '',
        end: event.end?.dateTime ?? event.end?.date ?? '',
        summary: event.summary ?? '',
        status: event.status ?? 'confirmed',
      });
    }
  }

  const updates: string[] = [];

  // Sync tasks: if GCal event moved/deleted, update Prism
  for (const task of tasks) {
    if (!task.calendarEventId) continue;
    const gcalEvent = gcalMap.get(task.calendarEventId);

    if (!gcalEvent || gcalEvent.status === 'cancelled') {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled task: ${task.title}`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, task.timeBlockStart, task.timeBlockEnd)) {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd, dueDate: gcalStart },
      });
      updates.push(`Rescheduled task: ${task.title}`);
    }
  }

  // Sync reviews: if GCal event moved/deleted, update Prism
  for (const review of reviews) {
    if (!review.calendarEventId) continue;
    const gcalEvent = gcalMap.get(review.calendarEventId);

    if (!gcalEvent || gcalEvent.status === 'cancelled') {
      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled review`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, review.timeBlockStart, review.timeBlockEnd)) {
      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd },
      });
      updates.push(`Rescheduled review`);
    }
  }

  return Response.json({
    synced: true,
    updates,
    gcalEventsCount: gcalEvents.length,
    prismItemsChecked: tasks.length + aimInstances.length + reviews.length,
  });
}
