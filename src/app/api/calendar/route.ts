import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { listGoogleEvents, createGoogleEvent, hasGoogleAccount } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const source = searchParams.get('source'); // 'tasks' | 'google' | 'reviews' | 'meetings' | 'all'

  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const availability = searchParams.get('availability');

  // Availability mode: return busy slots from all sources
  if (availability === 'true') {
    const busySlots: { start: string; end: string; title: string }[] = [];

    // 1. Task time blocks
    const tasks = await prisma.task.findMany({
      where: {
        ownerId: auth.userId,
        timeBlockStart: { gte: new Date(start), lte: new Date(end) },
        timeBlockEnd: { not: null },
        status: { notIn: ['DONE', 'DROPPED'] },
      },
      select: { title: true, timeBlockStart: true, timeBlockEnd: true },
    });
    for (const t of tasks) {
      if (t.timeBlockStart && t.timeBlockEnd) {
        busySlots.push({
          start: t.timeBlockStart.toISOString(),
          end: t.timeBlockEnd.toISOString(),
          title: t.title,
        });
      }
    }

    // 2. Meetings
    const meetings = await prisma.meeting.findMany({
      include: { createdBy: { select: { name: true } } },
    });
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    for (const meeting of meetings) {
      const attendees = (meeting.attendeeIds as string[]) || [];
      if (!attendees.includes(auth.userId) && meeting.createdById !== auth.userId) {
        continue;
      }
      const instances = generateMeetingInstances(meeting, rangeStart, rangeEnd);
      for (const inst of instances) {
        busySlots.push({
          start: inst.start.toISOString(),
          end: inst.end.toISOString(),
          title: meeting.title,
        });
      }
    }

    // 3. Google Calendar events (if linked)
    try {
      const hasGoogle = await hasGoogleAccount(auth.userId);
      if (hasGoogle) {
        const googleEvents = await listGoogleEvents(auth.userId, start, end);
        for (const ge of googleEvents) {
          const geStart = ge.start?.dateTime ?? ge.start?.date;
          const geEnd = ge.end?.dateTime ?? ge.end?.date;
          if (geStart && geEnd) {
            busySlots.push({
              start: geStart,
              end: geEnd,
              title: ge.summary ?? 'Google Calendar Event',
            });
          }
        }
      }
    } catch (err) {
      console.warn('[calendar] Google availability check failed:', err);
    }

    // Sort by start time
    busySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return Response.json(busySlots);
  }

  const events: any[] = [];
  const fetchAll = !source || source === 'all';

  // Check if user has disabled reviews
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: auth.userId },
    select: { reviewNags: true },
  });
  const reviewsEnabled = !prefs || prefs.reviewNags;

  // Run independent queries in parallel
  const [tasks, reviews, meetings, googleEvents] = await Promise.all([
    (fetchAll || source === 'tasks')
      ? prisma.task.findMany({
          where: {
            ownerId: auth.userId,
            OR: [
              { timeBlockStart: { gte: new Date(start), lte: new Date(end) } },
              { dueDate: { gte: new Date(start), lte: new Date(end) } },
            ],
          },
          include: { goal: { select: { title: true } } },
        })
      : Promise.resolve([]),
    (fetchAll || source === 'reviews') && reviewsEnabled
      ? prisma.review.findMany({
          where: {
            userId: auth.userId,
            scheduledDate: { gte: new Date(start), lte: new Date(end) },
          },
        })
      : Promise.resolve([]),
    (fetchAll || source === 'meetings')
      ? prisma.meeting.findMany({
          include: { createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    (fetchAll || source === 'google')
      ? listGoogleEvents(auth.userId, start, end).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Process tasks
  for (const task of tasks) {
    events.push({
      id: `task-${task.id}`,
      title: task.title,
      start: task.timeBlockStart?.toISOString() ?? task.dueDate?.toISOString(),
      end: task.timeBlockEnd?.toISOString() ?? undefined,
      allDay: !task.timeBlockStart,
      source: 'task',
      taskId: task.id,
      status: task.status,
      taskType: task.taskType,
      color: task.taskType === 'GOAL_STACK' ? '#6366f1' : task.taskType === 'REACT' ? '#eab308' : '#06b6d4',
    });
  }

  // Process reviews
  for (const review of reviews) {
    events.push({
      id: `review-${review.id}`,
      title: `${review.reviewType} Review`,
      start: review.scheduledDate.toISOString(),
      allDay: true,
      source: 'review',
      reviewId: review.id,
      completed: !!review.completedAt,
      color: review.completedAt ? '#22c55e' : '#f59e0b',
    });
  }

  // Process meetings
  const startDate = new Date(start);
  const endDate = new Date(end);
  for (const meeting of meetings) {
    const attendees = (meeting.attendeeIds as string[]) || [];
    if (!attendees.includes(auth.userId) && meeting.createdById !== auth.userId) {
      continue;
    }
    const instances = generateMeetingInstances(meeting, startDate, endDate);
    for (const instance of instances) {
      events.push({
        id: `meeting-${meeting.id}-${instance.start.toISOString()}`,
        title: meeting.title,
        start: instance.start.toISOString(),
        end: instance.end.toISOString(),
        allDay: false,
        source: 'meeting',
        meetingId: meeting.id,
        description: meeting.description,
        cadence: meeting.cadence,
        createdBy: meeting.createdBy.name,
        color: '#10b981',
      });
    }
  }

  // Process Google Calendar events
  for (const ge of googleEvents) {
    events.push({
      id: `google-${ge.id}`,
      title: ge.summary,
      start: ge.start?.dateTime ?? ge.start?.date,
      end: ge.end?.dateTime ?? ge.end?.date,
      allDay: !ge.start?.dateTime,
      source: 'google',
      meetLink: ge.hangoutLink,
      color: '#9333ea',
    });
  }

  return Response.json(events);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { summary, description, start, end, addMeetLink } = body;

  if (!summary || !start || !end) {
    return Response.json({ error: 'summary, start, and end are required' }, { status: 400 });
  }

  const event = await createGoogleEvent(auth.userId, {
    summary,
    description,
    start,
    end,
    addMeetLink,
  });

  if (!event) {
    return Response.json({ error: 'Failed to create event. Google Calendar may not be connected.' }, { status: 400 });
  }

  return Response.json(event, { status: 201 });
}

// Generate recurring meeting instances within a date range
function generateMeetingInstances(
  meeting: { cadence: string; dayOfWeek: number | null; timeStart: string; timeEnd: string },
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  const instances: { start: Date; end: Date }[] = [];
  const [startH, startM] = meeting.timeStart.split(':').map(Number);
  const [endH, endM] = meeting.timeEnd.split(':').map(Number);

  // Iterate day-by-day through range (capped at 366 days for safety)
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const maxIterations = 366;
  let iterations = 0;

  while (cursor <= rangeEnd && iterations < maxIterations) {
    iterations++;
    const dow = cursor.getDay(); // 0=Sun ... 6=Sat
    let matches = false;

    switch (meeting.cadence) {
      case 'DAILY':
        // Every weekday (Mon-Fri) if no dayOfWeek specified, otherwise every day
        matches = meeting.dayOfWeek === null ? (dow >= 1 && dow <= 5) : true;
        break;
      case 'WEEKLY':
        matches = meeting.dayOfWeek !== null ? dow === meeting.dayOfWeek : dow === 1; // default Monday
        break;
      case 'BIWEEKLY': {
        // Match the day of week, every other week (using epoch week parity)
        const targetDow = meeting.dayOfWeek ?? 1;
        if (dow === targetDow) {
          const weekNum = Math.floor(cursor.getTime() / (7 * 24 * 60 * 60 * 1000));
          matches = weekNum % 2 === 0;
        }
        break;
      }
      case 'MONTHLY':
        // First occurrence of the specified day in the month
        if (meeting.dayOfWeek !== null) {
          matches = dow === meeting.dayOfWeek && cursor.getDate() <= 7;
        } else {
          matches = cursor.getDate() === 1; // first of month
        }
        break;
      case 'QUARTERLY':
        // First occurrence of the day in quarter months (Jan, Apr, Jul, Oct)
        if ([0, 3, 6, 9].includes(cursor.getMonth())) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && cursor.getDate() <= 7;
          } else {
            matches = cursor.getDate() === 1;
          }
        }
        break;
      case 'YEARLY':
        // Jan 1st or first occurrence of the day in January
        if (cursor.getMonth() === 0) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && cursor.getDate() <= 7;
          } else {
            matches = cursor.getDate() === 1;
          }
        }
        break;
    }

    if (matches) {
      const eventStart = new Date(cursor);
      eventStart.setHours(startH, startM, 0, 0);
      const eventEnd = new Date(cursor);
      eventEnd.setHours(endH, endM, 0, 0);

      if (eventStart >= rangeStart && eventStart <= rangeEnd) {
        instances.push({ start: eventStart, end: eventEnd });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return instances;
}
