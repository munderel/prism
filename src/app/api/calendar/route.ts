import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents, createGoogleEvent } from '@/lib/calendar';

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

  // Fetch user settings early (needed for both availability and normal modes)
  const userSettingsEarly = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { selectedCalendarIds: true, powerdownTime: true, weeklyReviewDayOfWeek: true, weeklyReviewTime: true, weeklyReviewDuration: true },
  });
  const earlyCalendarIds = Array.isArray(userSettingsEarly?.selectedCalendarIds)
    ? (userSettingsEarly.selectedCalendarIds as string[])
    : [];

  // Availability mode: return busy slots from all sources
  if (availability === 'true') {
    const busySlots: { start: string; end: string; title: string }[] = [];
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);

    const [tasks, meetings, googleEvents] = await Promise.all([
      prisma.task.findMany({
        where: {
          ownerId: auth.userId,
          timeBlockStart: { gte: rangeStart, lte: rangeEnd },
          timeBlockEnd: { not: null },
          status: { notIn: ['DONE', 'DROPPED'] },
        },
        select: { title: true, timeBlockStart: true, timeBlockEnd: true },
      }),
      prisma.meeting.findMany({
        where: {
          OR: [
            { cadence: { not: 'ONE_TIME' } },
            { occurDate: { gte: rangeStart, lte: rangeEnd } },
          ],
        },
        include: { createdBy: { select: { name: true } } },
      }),
      listGoogleEvents(auth.userId, start, end, earlyCalendarIds.length > 0 ? earlyCalendarIds : undefined).catch(() => []),
    ]);

    for (const t of tasks) {
      if (t.timeBlockStart && t.timeBlockEnd) {
        busySlots.push({
          start: t.timeBlockStart.toISOString(),
          end: t.timeBlockEnd.toISOString(),
          title: t.title,
        });
      }
    }

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
  const [tasks, reviews, meetings, googleEvents, aimInstances] = await Promise.all([
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
            OR: [
              { scheduledDate: { gte: new Date(start), lte: new Date(end) } },
              { timeBlockStart: { gte: new Date(start), lte: new Date(end) } },
            ],
          },
        })
      : Promise.resolve([]),
    (fetchAll || source === 'meetings')
      ? prisma.meeting.findMany({
          where: {
            OR: [
              { cadence: { not: 'ONE_TIME' } },
              { occurDate: { gte: new Date(start), lte: new Date(end) } },
            ],
          },
          include: { createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    (fetchAll || source === 'google')
      ? listGoogleEvents(auth.userId, start, end, earlyCalendarIds.length > 0 ? earlyCalendarIds : undefined).catch(() => [])
      : Promise.resolve([]),
    (fetchAll || source === 'aims')
      ? prisma.aimInstance.findMany({
          where: {
            userId: auth.userId,
            scheduledDate: {
              gte: new Date(start),
              lte: new Date(end),
            },
          },
          include: { aimCategory: true, tasks: { select: { id: true, title: true, status: true } } },
        })
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
      color: task.taskType === 'IMPROVE' ? '#6366f1' : task.taskType === 'REACT' ? '#eab308' : '#06b6d4',
    });
  }

  // Process reviews
  for (const review of reviews) {
    const hasTimeBlock = review.timeBlockStart && review.timeBlockEnd;
    events.push({
      id: `review-${review.id}`,
      title: `${review.reviewType} Review`,
      start: hasTimeBlock ? review.timeBlockStart!.toISOString() : review.scheduledDate.toISOString(),
      end: hasTimeBlock ? review.timeBlockEnd!.toISOString() : undefined,
      allDay: !hasTimeBlock,
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
        color: '#f97316',
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

  // Process Aim instances
  for (const aim of aimInstances) {
    const aimTitle = aim.selectedActivity
      ? `${aim.aimCategory.name}: ${aim.selectedActivity}`
      : aim.aimCategory.name;
    events.push({
      id: `aim-${aim.id}`,
      title: aim.isGroupOpen ? `\u{1F91D} ${aimTitle}` : aimTitle,
      start: aim.timeBlockStart?.toISOString() ?? aim.scheduledDate.toISOString(),
      end: aim.timeBlockEnd?.toISOString() ?? undefined,
      allDay: !aim.timeBlockStart,
      source: 'aims',
      aimInstanceId: aim.id,
      aimCategoryId: aim.aimCategoryId,
      aimCategoryName: aim.aimCategory.name,
      status: aim.status,
      isGroupOpen: aim.isGroupOpen,
      tasks: (aim as any).tasks || [],
      backgroundColor: aim.isGroupOpen ? '#0d9488' : '#14b8a6',
      color: aim.isGroupOpen ? '#0d9488' : '#14b8a6',
    });
  }

  // Generate powerdown events if user has powerdownTime set
  if (userSettingsEarly?.powerdownTime) {
    const [pdH, pdM] = userSettingsEarly.powerdownTime.split(':').map(Number);
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);

    // Fetch any per-session time overrides in the date range
    const pdSessions = await prisma.powerdownSession.findMany({
      where: {
        userId: auth.userId,
        sessionDate: { gte: rangeStart, lte: rangeEnd },
        OR: [
          { timeBlockStart: { not: null } },
          { timeBlockEnd: { not: null } },
        ],
      },
      select: { sessionDate: true, timeBlockStart: true, timeBlockEnd: true },
    });
    const pdOverrides = new Map<string, { start: Date; end: Date }>();
    for (const s of pdSessions) {
      const dateKey = s.sessionDate.toISOString().split('T')[0];
      if (s.timeBlockStart && s.timeBlockEnd) {
        pdOverrides.set(dateKey, { start: s.timeBlockStart, end: s.timeBlockEnd });
      }
    }

    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);
    const maxDays = 366;
    let dayCount = 0;

    while (cursor <= rangeEnd && dayCount < maxDays) {
      dayCount++;
      const dateKey = cursor.toISOString().split('T')[0];
      const override = pdOverrides.get(dateKey);

      let pdStart: Date;
      let pdEnd: Date;

      if (override) {
        // Use per-session one-time override
        pdStart = override.start;
        pdEnd = override.end;
      } else {
        // Use default powerdown time
        pdStart = new Date(cursor);
        pdStart.setHours(pdH, pdM, 0, 0);
        pdEnd = new Date(cursor);
        pdEnd.setHours(pdH, pdM + 30, 0, 0); // 30-minute block
      }

      if (pdStart >= rangeStart && pdStart <= rangeEnd) {
        events.push({
          id: `powerdown-${dateKey}`,
          title: 'Power Down Ritual',
          start: pdStart.toISOString(),
          end: pdEnd.toISOString(),
          allDay: false,
          source: 'powerdown',
          color: '#7c3aed',
          link: '/powerdown',
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Generate individual weekly review events
  if ((fetchAll || source === 'reviews') && reviewsEnabled &&
      userSettingsEarly?.weeklyReviewDayOfWeek != null &&
      userSettingsEarly?.weeklyReviewTime) {
    const [rwH, rwM] = userSettingsEarly.weeklyReviewTime.split(':').map(Number);
    const duration = userSettingsEarly.weeklyReviewDuration ?? 60;
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);
    const maxDays = 366;
    let dayCount = 0;

    while (cursor <= rangeEnd && dayCount < maxDays) {
      dayCount++;
      if (cursor.getDay() === userSettingsEarly.weeklyReviewDayOfWeek) {
        const evStart = new Date(cursor);
        evStart.setHours(rwH, rwM, 0, 0);
        const evEnd = new Date(evStart);
        evEnd.setMinutes(evEnd.getMinutes() + duration);
        const dateKey = cursor.toISOString().split('T')[0];

        if (evStart >= rangeStart && evStart <= rangeEnd) {
          events.push({
            id: `weekly-review-${dateKey}`,
            title: 'Weekly Review',
            start: evStart.toISOString(),
            end: evEnd.toISOString(),
            allDay: false,
            source: 'reviews',
            color: '#2563eb',
            link: '/reviews',
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Generate team review events (visible to all users)
  if (fetchAll || source === 'reviews') {
    const teamReviews = await prisma.recurringTeamReview.findMany({
      where: { isActive: true },
    });

    for (const tr of teamReviews) {
      const [trH, trM] = tr.time.split(':').map(Number);
      const rangeStart = new Date(start);
      const rangeEnd = new Date(end);
      const cursor = new Date(rangeStart);
      cursor.setHours(0, 0, 0, 0);
      const maxDays = 366;
      let dayCount = 0;

      while (cursor <= rangeEnd && dayCount < maxDays) {
        dayCount++;
        if (cursor.getDay() === tr.dayOfWeek) {
          const evStart = new Date(cursor);
          evStart.setHours(trH, trM, 0, 0);
          const evEnd = new Date(evStart);
          evEnd.setMinutes(evEnd.getMinutes() + tr.duration);
          const dateKey = cursor.toISOString().split('T')[0];

          if (evStart >= rangeStart && evStart <= rangeEnd) {
            events.push({
              id: `team-review-${tr.id}-${dateKey}`,
              title: 'TEAM REVIEW',
              start: evStart.toISOString(),
              end: evEnd.toISOString(),
              allDay: false,
              source: 'reviews',
              color: '#ea580c',
              link: '/reviews',
            });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return Response.json(events);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
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
  meeting: { cadence: string; dayOfWeek: number | null; occurDate?: Date | null; timeStart: string; timeEnd: string },
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  const instances: { start: Date; end: Date }[] = [];
  const [startH, startM] = meeting.timeStart.split(':').map(Number);
  const [endH, endM] = meeting.timeEnd.split(':').map(Number);

  // One-time meetings: just check if the specific date falls in range
  if (meeting.cadence === 'ONE_TIME' && meeting.occurDate) {
    const d = new Date(meeting.occurDate);
    d.setHours(0, 0, 0, 0);
    if (d >= rangeStart && d <= rangeEnd) {
      const s = new Date(d);
      s.setHours(startH, startM, 0, 0);
      const e = new Date(d);
      e.setHours(endH, endM, 0, 0);
      instances.push({ start: s, end: e });
    }
    return instances;
  }

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
