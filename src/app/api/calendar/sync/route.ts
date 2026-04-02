import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents, createGoogleEvent, getGoogleSyncInfo } from '@/lib/calendar';

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
 * Bidirectional sync between Google Calendar and Prism.
 * Phase 1: Pull GCal changes → apply to Prism tasks/reviews.
 * Phase 2: Push unsynced Prism items → create in GCal.
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

  const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
  if (!hasGoogle) {
    return Response.json(
      { error: 'Google Calendar is not connected. Sign out and sign in with Google again to enable sync.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { selectedCalendarIds: true },
  });

  const rawIds = Array.isArray(user?.selectedCalendarIds) ? (user.selectedCalendarIds as string[]) : undefined;
  // undefined = user never configured → listGoogleEvents defaults to primary
  // [] = user explicitly deselected all → listGoogleEvents returns nothing
  // [...ids] = user selected specific calendars → always include primary for sync
  const calendarIds = rawIds === undefined ? undefined
    : rawIds.length > 0 ? (rawIds.includes('primary') ? rawIds : ['primary', ...rawIds])
    : rawIds;

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
      include: { aimCategory: { select: { name: true } } },
    }),
    prisma.review.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        timeBlockStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true, reviewType: true },
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

  // === PHASE 1: PULL (GCal → Prism) ===

  // Sync tasks: if GCal event moved/cancelled, update Prism
  for (const task of tasks) {
    if (!task.calendarEventId) continue;
    const gcalEvent = gcalMap.get(task.calendarEventId);

    // Only clear scheduling when event is explicitly cancelled in GCal
    if (gcalEvent?.status === 'cancelled') {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled task (cancelled in GCal): ${task.title}`);
      continue;
    }

    // Event not found in batch results -- could be pagination, rate limit, or wrong calendar.
    // Do NOT clear scheduling to prevent data loss.
    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${task.calendarEventId} for task "${task.title}" not found in batch -- skipping`);
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

  // Sync reviews: if GCal event moved/cancelled, update Prism
  for (const review of reviews) {
    if (!review.calendarEventId) continue;
    const gcalEvent = gcalMap.get(review.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled review (cancelled in GCal)`);
      continue;
    }

    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${review.calendarEventId} for review not found in batch -- skipping`);
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

  // Sync aim instances: if GCal event moved/cancelled, update Prism
  for (const aim of aimInstances) {
    if (!aim.calendarEventId) continue;
    const gcalEvent = gcalMap.get(aim.calendarEventId);

    if (gcalEvent?.status === 'cancelled') {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled aim (cancelled in GCal): ${aim.aimCategory.name}`);
      continue;
    }

    if (!gcalEvent) {
      console.warn(`[sync] GCal event ${aim.calendarEventId} for aim "${aim.aimCategory.name}" not found in batch -- skipping`);
      continue;
    }

    const gcalStart = new Date(gcalEvent.start);
    const gcalEnd = new Date(gcalEvent.end);
    if (hasTimeDrifted(gcalStart, gcalEnd, aim.timeBlockStart, aim.timeBlockEnd)) {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: gcalStart, timeBlockEnd: gcalEnd },
      });
      updates.push(`Rescheduled aim: ${aim.aimCategory.name}`);
    }
  }

  // === PHASE 2: PUSH (Prism → GCal) ===

  // Push unsynced tasks
  const unsyncedTasks = await prisma.task.findMany({
    where: {
      ownerId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      status: { notIn: ['DONE', 'DROPPED'] },
    },
    select: { id: true, title: true, description: true, timeBlockStart: true, timeBlockEnd: true },
  });

  for (const task of unsyncedTasks) {
    if (!task.timeBlockStart || !task.timeBlockEnd) continue;
    try {
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: task.title,
        description: task.description || undefined,
        start: task.timeBlockStart.toISOString(),
        end: task.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed task to Google: ${task.title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  // Push unsynced aim instances
  const unsyncedAims = await prisma.aimInstance.findMany({
    where: {
      userId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      status: { not: 'SKIPPED' },
    },
    include: { aimCategory: { select: { name: true } } },
  });

  for (const aim of unsyncedAims) {
    if (!aim.timeBlockStart || !aim.timeBlockEnd) continue;
    try {
      const title = aim.selectedActivity ? `${aim.aimCategory.name}: ${aim.selectedActivity}` : aim.aimCategory.name;
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        start: aim.timeBlockStart.toISOString(),
        end: aim.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.aimInstance.update({ where: { id: aim.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed aim to Google: ${title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  // Push unsynced reviews
  const unsyncedReviews = await prisma.review.findMany({
    where: {
      userId: auth.userId,
      calendarEventId: null,
      timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd },
      timeBlockEnd: { not: null },
      completedAt: null,
    },
    select: { id: true, reviewType: true, timeBlockStart: true, timeBlockEnd: true },
  });

  for (const review of unsyncedReviews) {
    if (!review.timeBlockStart || !review.timeBlockEnd) continue;
    try {
      const title = `${review.reviewType} Review`;
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        start: review.timeBlockStart.toISOString(),
        end: review.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.review.update({ where: { id: review.id }, data: { calendarEventId: gcalEvent.id } });
        updates.push(`Pushed review to Google: ${title}`);
      }
    } catch {
      // Continue with other items
    }
  }

  return Response.json({
    synced: true,
    updates,
    gcalEventsCount: gcalEvents.length,
    prismItemsChecked: tasks.length + aimInstances.length + reviews.length,
    prismItemsPushed: unsyncedTasks.length + unsyncedAims.length + unsyncedReviews.length,
  });
}
