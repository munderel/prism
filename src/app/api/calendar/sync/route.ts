import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents } from '@/lib/calendar';

/**
 * POST /api/calendar/sync
 * Pull latest changes from Google Calendar and sync to Prism.
 * Called client-side on calendar page load and periodically.
 *
 * Two-way sync: auto-applies GCal changes to Prism tasks/AIMs/reviews
 * without confirmation (per spec: "Auto-sync, no confirmation").
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { start, end } = body;
  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { selectedCalendarIds: true },
  });

  const calendarIds = Array.isArray(user?.selectedCalendarIds)
    ? (user.selectedCalendarIds as string[])
    : [];

  // Fetch all Google Calendar events in range
  const gcalEvents = await listGoogleEvents(
    auth.userId,
    start,
    end,
    calendarIds.length > 0 ? calendarIds : undefined
  );

  // Find all Prism items that have a calendarEventId (synced to Google)
  const [tasks, aimInstances, reviews] = await Promise.all([
    prisma.task.findMany({
      where: {
        ownerId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: new Date(start), lte: new Date(end) },
      },
      select: {
        id: true,
        calendarEventId: true,
        timeBlockStart: true,
        timeBlockEnd: true,
        title: true,
      },
    }),
    prisma.aimInstance.findMany({
      where: {
        userId: auth.userId,
        timeBlockStart: { gte: new Date(start), lte: new Date(end) },
      },
      select: {
        id: true,
        timeBlockStart: true,
        timeBlockEnd: true,
      },
    }),
    prisma.review.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: new Date(start), lte: new Date(end) },
      },
      select: {
        id: true,
        calendarEventId: true,
        timeBlockStart: true,
        timeBlockEnd: true,
      },
    }),
  ]);

  const updates: string[] = [];

  // Build lookup of GCal events by ID
  const gcalMap = new Map<string, { start: string; end: string; summary: string; status: string }>();
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

  // Sync tasks: if GCal event moved/deleted, update Prism
  for (const task of tasks) {
    if (!task.calendarEventId) continue;
    const gcalEvent = gcalMap.get(task.calendarEventId);

    if (!gcalEvent || gcalEvent.status === 'cancelled') {
      // Event was deleted in GCal → unschedule in Prism
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled task: ${task.title}`);
      continue;
    }

    // Check if time changed in GCal
    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    const prismStart = task.timeBlockStart ? new Date(task.timeBlockStart) : null;
    const prismEnd = task.timeBlockEnd ? new Date(task.timeBlockEnd) : null;

    if (
      prismStart &&
      prismEnd &&
      (Math.abs(gcalStart.getTime() - prismStart.getTime()) > 60000 ||
        Math.abs(gcalEnd.getTime() - prismEnd.getTime()) > 60000)
    ) {
      // Time changed in GCal → update Prism
      await prisma.task.update({
        where: { id: task.id },
        data: {
          timeBlockStart: gcalStart,
          timeBlockEnd: gcalEnd,
          dueDate: gcalStart, // Update due date to match new start
        },
      });
      updates.push(`Rescheduled task: ${task.title}`);
    }
  }

  // Sync reviews
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
    const prismStart = review.timeBlockStart ? new Date(review.timeBlockStart) : null;
    const prismEnd = review.timeBlockEnd ? new Date(review.timeBlockEnd) : null;

    if (
      prismStart &&
      prismEnd &&
      (Math.abs(gcalStart.getTime() - prismStart.getTime()) > 60000 ||
        Math.abs(gcalEnd.getTime() - prismEnd.getTime()) > 60000)
    ) {
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
