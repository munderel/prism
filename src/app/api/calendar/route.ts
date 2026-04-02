import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents, createGoogleEvent, getUserSyncCalendarId } from '@/lib/calendar';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const MAX_DAYS = 366;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Iterate day-by-day through a date range, calling `onDay` for each day.
 *  The callback receives a zoned cursor (local day/date/month values) and a YYYY-MM-DD dateKey. */
function forEachDayInRange(
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  onDay: (zonedCursor: Date, dateKey: string) => void,
): void {
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  let dayCount = 0;

  while (cursor <= rangeEnd && dayCount < MAX_DAYS) {
    dayCount++;
    const zoned = toZonedTime(cursor, timezone);
    const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
    onDay(zoned, dateKey);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** Create a timed event within a range and push it to the events array. */
function pushTimedEvent(
  events: any[],
  rangeStart: Date,
  rangeEnd: Date,
  dateKey: string,
  hours: number,
  minutes: number,
  duration: number,
  timezone: string,
  eventData: Record<string, any>,
): void {
  const evStart = fromZonedTime(`${dateKey}T${pad2(hours)}:${pad2(minutes)}:00`, timezone);
  const evEnd = new Date(evStart.getTime() + duration * 60_000);

  if (evStart >= rangeStart && evStart <= rangeEnd) {
    events.push({
      start: evStart.toISOString(),
      end: evEnd.toISOString(),
      allDay: false,
      ...eventData,
    });
  }
}

function matchesMonthlyRule(d: Date, rule: string): boolean {
  const day = d.getDay();
  const date = d.getDate();
  const month = d.getMonth();
  const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();

  switch (rule) {
    case 'last-friday': {
      const lastDate = new Date(d.getFullYear(), month + 1, 0);
      const diff = (lastDate.getDay() - 5 + 7) % 7;
      return date === lastDay - diff;
    }
    case 'last-monday': {
      const lastDate = new Date(d.getFullYear(), month + 1, 0);
      const diff = (lastDate.getDay() - 1 + 7) % 7;
      return date === lastDay - diff;
    }
    case '1st-monday': return date <= 7 && day === 1;
    case '1st-friday': return date <= 7 && day === 5;
    case '15th': return date === 15;
    default: return false;
  }
}

function matchesYearlyRule(d: Date, rule: string): boolean {
  const month = d.getMonth();
  const date = d.getDate();

  switch (rule) {
    case 'dec-30': return month === 11 && date === 30;
    case 'dec-31': return month === 11 && date === 31;
    case 'last-sat-dec': {
      if (month !== 11) return false;
      const lastDate = new Date(d.getFullYear(), 12, 0);
      const lastDay = lastDate.getDate();
      const diff = (lastDate.getDay() - 6 + 7) % 7;
      return date === lastDay - diff;
    }
    default: {
      if (rule.startsWith('custom:')) {
        const parts = rule.slice(7).split('-');
        const ruleMonth = parseInt(parts[0]) - 1;
        const ruleDay = parseInt(parts[1]);
        return month === ruleMonth && date === ruleDay;
      }
      return false;
    }
  }
}

/** Check if a user is an attendee or creator of a meeting. */
function isUserInMeeting(meeting: { attendeeIds: unknown; createdById: string }, userId: string): boolean {
  let attendees: string[] = [];
  if (Array.isArray(meeting.attendeeIds)) {
    attendees = meeting.attendeeIds;
  } else if (typeof meeting.attendeeIds === 'string') {
    try { attendees = JSON.parse(meeting.attendeeIds); } catch { /* ignore */ }
  }
  return attendees.includes(userId) || meeting.createdById === userId;
}

/** Convert selectedCalendarIds to a string array, or undefined if empty. */
function parseCalendarIds(raw: unknown): string[] | undefined {
  const ids = Array.isArray(raw) ? (raw as string[]) : [];
  return ids.length > 0 ? ids : undefined;
}

function taskTypeColor(taskType: string): string {
  switch (taskType) {
    case 'IMPROVE': return '#6366f1';
    case 'REACT': return '#eab308';
    default: return '#06b6d4';
  }
}

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

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  const userSettings = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true, selectedCalendarIds: true, calendarColorOverrides: true, powerdownTime: true, weeklyReviewDayOfWeek: true, weeklyReviewTime: true, weeklyReviewDuration: true, monthlyReviewRecurrenceRule: true, monthlyReviewTime: true, monthlyReviewDuration: true, yearlyReviewRecurrenceRule: true, yearlyReviewTime: true, yearlyReviewDuration: true },
  });
  const userTz = userSettings?.timezone ?? 'America/New_York';
  const calendarIds = parseCalendarIds(userSettings?.selectedCalendarIds);
  const colorOverrides = (userSettings?.calendarColorOverrides && typeof userSettings.calendarColorOverrides === 'object' && !Array.isArray(userSettings.calendarColorOverrides))
    ? (userSettings.calendarColorOverrides as Record<string, string>)
    : {};

  // Availability mode: return busy slots from all sources
  if (searchParams.get('availability') === 'true') {
    const busySlots: { start: string; end: string; title: string }[] = [];

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
      listGoogleEvents(auth.userId, start, end, calendarIds).catch(() => []),
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
      if (!isUserInMeeting(meeting, auth.userId)) continue;
      for (const inst of generateMeetingInstances(meeting, rangeStart, rangeEnd, userTz)) {
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
  // 'external' fetches only Google, meetings, reviews, processes — excludes tasks/aims/powerdown
  const fetchExternal = source === 'external';

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: auth.userId },
    select: { reviewNags: true },
  });
  const reviewsEnabled = !prefs || prefs.reviewNags;
  const shouldFetchReviews = (fetchAll || fetchExternal || source === 'reviews') && reviewsEnabled;

  let googleStatus: 'ok' | 'error' | 'not_connected' = 'ok';
  let googleError: string | undefined;

  // Run independent queries in parallel
  const [tasks, reviews, meetings, googleEvents, aimInstances] = await Promise.all([
    (fetchAll || source === 'tasks')
      ? prisma.task.findMany({
          where: {
            ownerId: auth.userId,
            OR: [
              { timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
              { dueDate: { gte: rangeStart, lte: rangeEnd } },
            ],
          },
          include: { goal: { select: { title: true } } },
        })
      : Promise.resolve([]),
    shouldFetchReviews
      ? prisma.review.findMany({
          where: {
            userId: auth.userId,
            OR: [
              { scheduledDate: { gte: rangeStart, lte: rangeEnd } },
              { timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
            ],
          },
        })
      : Promise.resolve([]),
    (fetchAll || fetchExternal || source === 'meetings')
      ? prisma.meeting.findMany({
          where: {
            OR: [
              { cadence: { not: 'ONE_TIME' } },
              { occurDate: { gte: rangeStart, lte: rangeEnd } },
            ],
          },
          include: { createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    (fetchAll || fetchExternal || source === 'google')
      ? listGoogleEvents(auth.userId, start, end, calendarIds).catch((err) => {
          googleStatus = 'error';
          googleError = err instanceof Error ? err.message : 'Failed to fetch Google Calendar events';
          console.error('[calendar] Google Calendar fetch failed:', err);
          return [];
        })
      : Promise.resolve([]),
    (fetchAll || source === 'aims')
      ? prisma.aimInstance.findMany({
          where: {
            userId: auth.userId,
            scheduledDate: { gte: rangeStart, lte: rangeEnd },
          },
          include: { aimCategory: true, tasks: { select: { id: true, title: true, status: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Detect "not connected" — Google was requested but returned empty without error
  if ((fetchAll || fetchExternal || source === 'google') && googleStatus === 'ok' && googleEvents.length === 0) {
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { googleRefreshToken: true } });
    if (!user?.googleRefreshToken) {
      googleStatus = 'not_connected';
    }
  }

  for (const task of tasks) {
    events.push({
      id: `task-${task.id}`,
      title: task.title,
      start: task.timeBlockStart?.toISOString() ?? task.dueDate?.toISOString(),
      end: task.timeBlockEnd?.toISOString() ?? undefined,
      allDay: !task.timeBlockStart,
      source: 'tasks',
      taskId: task.id,
      status: task.status,
      taskType: task.taskType,
      color: taskTypeColor(task.taskType),
    });
  }

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

  for (const meeting of meetings) {
    if (!isUserInMeeting(meeting, auth.userId)) continue;
    for (const instance of generateMeetingInstances(meeting, rangeStart, rangeEnd, userTz)) {
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

  for (const ge of googleEvents) {
    const sourceCalId = (ge as any)._sourceCalendarId;
    const eventColor = colorOverrides[sourceCalId] || (ge as any).colorId || '#9333ea';
    events.push({
      id: `google-${ge.id}`,
      title: ge.summary,
      start: ge.start?.dateTime ?? ge.start?.date,
      end: ge.end?.dateTime ?? ge.end?.date,
      allDay: !ge.start?.dateTime,
      source: 'google',
      meetLink: ge.hangoutLink,
      calendarId: sourceCalId,
      color: eventColor,
    });
  }

  for (const aim of aimInstances) {
    const aimTitle = aim.selectedActivity
      ? `${aim.aimCategory.name}: ${aim.selectedActivity}`
      : aim.aimCategory.name;
    const aimColor = aim.isGroupOpen ? '#0d9488' : '#14b8a6';
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
      backgroundColor: aimColor,
      color: aimColor,
    });
  }

  // Generate powerdown events if user has powerdownTime set (skip for 'external' source)
  if (userSettings?.powerdownTime && !fetchExternal) {
    const [pdH, pdM] = userSettings.powerdownTime.split(':').map(Number);

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
      if (s.timeBlockStart && s.timeBlockEnd) {
        const dateKey = s.sessionDate.toISOString().split('T')[0];
        pdOverrides.set(dateKey, { start: s.timeBlockStart, end: s.timeBlockEnd });
      }
    }

    forEachDayInRange(rangeStart, rangeEnd, userTz, (_zonedCursor, dateKey) => {
      const override = pdOverrides.get(dateKey);

      let pdStart: Date;
      let pdEnd: Date;
      if (override) {
        pdStart = override.start;
        pdEnd = override.end;
      } else {
        pdStart = fromZonedTime(`${dateKey}T${pad2(pdH)}:${pad2(pdM)}:00`, userTz);
        pdEnd = new Date(pdStart.getTime() + 30 * 60_000);
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
    });
  }

  // Generate recurring review events (weekly, monthly, yearly)
  if (shouldFetchReviews) {
    const reviewConfigs: {
      matchFn: (d: Date) => boolean;
      time: string;
      duration: number;
      idPrefix: string;
      title: string;
      color: string;
      type: string;
    }[] = [];

    if (userSettings?.weeklyReviewDayOfWeek != null && userSettings?.weeklyReviewTime) {
      reviewConfigs.push({
        matchFn: (d) => d.getDay() === userSettings.weeklyReviewDayOfWeek!,
        time: userSettings.weeklyReviewTime,
        duration: userSettings.weeklyReviewDuration ?? 60,
        idPrefix: 'weekly-review',
        title: 'Weekly Review',
        color: '#2563eb',
        type: 'WEEKLY',
      });
    }
    if (userSettings?.monthlyReviewRecurrenceRule && userSettings?.monthlyReviewTime) {
      reviewConfigs.push({
        matchFn: (d) => matchesMonthlyRule(d, userSettings.monthlyReviewRecurrenceRule!),
        time: userSettings.monthlyReviewTime,
        duration: userSettings.monthlyReviewDuration ?? 60,
        idPrefix: 'monthly-review',
        title: 'Monthly Review',
        color: '#7c3aed',
        type: 'MONTHLY',
      });
    }
    if (userSettings?.yearlyReviewRecurrenceRule && userSettings?.yearlyReviewTime) {
      reviewConfigs.push({
        matchFn: (d) => matchesYearlyRule(d, userSettings.yearlyReviewRecurrenceRule!),
        time: userSettings.yearlyReviewTime,
        duration: userSettings.yearlyReviewDuration ?? 60,
        idPrefix: 'yearly-review',
        title: 'Yearly Review',
        color: '#d97706',
        type: 'YEARLY',
      });
    }

    for (const config of reviewConfigs) {
      const [h, m] = config.time.split(':').map(Number);
      forEachDayInRange(rangeStart, rangeEnd, userTz, (zonedCursor, dateKey) => {
        if (config.matchFn(zonedCursor)) {
          pushTimedEvent(events, rangeStart, rangeEnd, dateKey, h, m, config.duration, userTz, {
            id: `${config.idPrefix}-${dateKey}`,
            title: config.title,
            source: 'reviews',
            color: config.color,
            link: `/reviews?action=start&type=${config.type}&date=${dateKey}`,
          });
        }
      });
    }
  }

  // Generate team review events (only for members of each team review)
  if (fetchAll || fetchExternal || source === 'reviews') {
    const teamReviews = await prisma.recurringTeamReview.findMany({
      where: {
        isActive: true,
        members: { some: { userId: auth.userId } },
      },
      include: { members: { select: { userId: true } } },
    });

    for (const tr of teamReviews) {
      const [trH, trM] = tr.time.split(':').map(Number);
      const matchFn = (cursor: Date): boolean => {
        if (tr.reviewType === 'WEEKLY' && tr.dayOfWeek != null) {
          return cursor.getDay() === tr.dayOfWeek;
        }
        if (tr.reviewType === 'MONTHLY' && tr.recurrenceRule) {
          return matchesMonthlyRule(cursor, tr.recurrenceRule);
        }
        if (tr.reviewType === 'YEARLY' && tr.recurrenceRule) {
          return matchesYearlyRule(cursor, tr.recurrenceRule);
        }
        return false;
      };

      forEachDayInRange(rangeStart, rangeEnd, userTz, (zonedCursor, dateKey) => {
        if (matchFn(zonedCursor)) {
          pushTimedEvent(events, rangeStart, rangeEnd, dateKey, trH, trM, tr.duration, userTz, {
            id: `team-review-${tr.id}-${dateKey}`,
            title: `TEAM ${tr.reviewType} REVIEW`,
            source: 'reviews',
            color: '#ea580c',
            link: '/reviews',
          });
        }
      });
    }
  }

  // Generate recurring process events
  const calendarProcesses = await prisma.process.findMany({
    where: {
      scheduledTime: { not: null },
      OR: [
        { assigneeId: auth.userId },
        { delegateId: auth.userId },
        { assigneeId: null },
      ],
    },
    select: {
      id: true,
      title: true,
      cadence: true,
      scheduledTime: true,
      scheduledDayOfWeek: true,
      scheduledDayOfMonth: true,
      defaultDurationMinutes: true,
    },
  });

  if (calendarProcesses.length > 0) {
    const processIds = calendarProcesses.map(p => p.id);
    const processExecutions = await prisma.processExecution.findMany({
      where: {
        processId: { in: processIds },
        scheduledDate: { gte: rangeStart, lte: rangeEnd },
        OR: [
          { timeBlockStart: { not: null } },
          { timeBlockEnd: { not: null } },
        ],
      },
      select: { processId: true, scheduledDate: true, timeBlockStart: true, timeBlockEnd: true },
    });

    const procOverrides = new Map<string, { start: Date; end: Date }>();
    for (const ex of processExecutions) {
      if (ex.timeBlockStart && ex.timeBlockEnd) {
        const dateKey = ex.scheduledDate.toISOString().split('T')[0];
        procOverrides.set(`${ex.processId}-${dateKey}`, { start: ex.timeBlockStart, end: ex.timeBlockEnd });
      }
    }

    for (const proc of calendarProcesses) {
      if (proc.cadence === 'ONE_TIME') continue;
      const [procH, procM] = proc.scheduledTime!.split(':').map(Number);
      const duration = proc.defaultDurationMinutes;

      forEachDayInRange(rangeStart, rangeEnd, userTz, (zonedCursor, dateKey) => {
        const dow = zonedCursor.getDay();
        let matches = false;

        switch (proc.cadence) {
          case 'DAILY':
            matches = dow >= 1 && dow <= 5;
            break;
          case 'WEEKLY':
            matches = proc.scheduledDayOfWeek != null ? dow === proc.scheduledDayOfWeek : dow === 1;
            break;
          case 'BIWEEKLY': {
            const targetDow = proc.scheduledDayOfWeek ?? 1;
            if (dow === targetDow) {
              const weekNum = Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / (7 * 24 * 60 * 60 * 1000));
              matches = weekNum % 2 === 0;
            }
            break;
          }
          case 'MONTHLY':
            matches = zonedCursor.getDate() === (proc.scheduledDayOfMonth ?? 1);
            break;
          case 'QUARTERLY':
            if ([0, 3, 6, 9].includes(zonedCursor.getMonth())) {
              matches = zonedCursor.getDate() === (proc.scheduledDayOfMonth ?? 1);
            }
            break;
          case 'YEARLY':
            matches = zonedCursor.getMonth() === 0 && zonedCursor.getDate() === 1;
            break;
        }

        if (!matches) return;

        const overrideKey = `${proc.id}-${dateKey}`;
        const override = procOverrides.get(overrideKey);

        let evStart: Date;
        let evEnd: Date;
        if (override) {
          evStart = override.start;
          evEnd = override.end;
        } else {
          evStart = fromZonedTime(`${dateKey}T${pad2(procH)}:${pad2(procM)}:00`, userTz);
          evEnd = new Date(evStart.getTime() + duration * 60_000);
        }

        if (evStart >= rangeStart && evStart <= rangeEnd) {
          events.push({
            id: `process-${proc.id}-${dateKey}`,
            title: proc.title,
            start: evStart.toISOString(),
            end: evEnd.toISOString(),
            allDay: false,
            source: 'processes',
            processId: proc.id,
            color: '#06b6d4',
            link: '/processes',
          });
        }
      });
    }
  }

  return Response.json({ events, googleStatus, googleError });
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

  const targetCalendarId = await getUserSyncCalendarId(auth.userId);
  const event = await createGoogleEvent(auth.userId, {
    summary,
    description,
    start,
    end,
    addMeetLink,
  }, targetCalendarId);

  if (!event) {
    return Response.json({ error: 'Failed to create event. Google Calendar may not be connected.' }, { status: 400 });
  }

  return Response.json(event, { status: 201 });
}

// Generate recurring meeting instances within a date range
function generateMeetingInstances(
  meeting: { cadence: string; dayOfWeek: number | null; occurDate?: Date | null; timeStart: string; timeEnd: string },
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): { start: Date; end: Date }[] {
  const instances: { start: Date; end: Date }[] = [];

  // One-time meetings: just check if the specific date falls in range
  if (meeting.cadence === 'ONE_TIME' && meeting.occurDate) {
    const zoned = toZonedTime(new Date(meeting.occurDate), timezone);
    const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
    const s = fromZonedTime(`${dateKey}T${meeting.timeStart}:00`, timezone);
    const e = fromZonedTime(`${dateKey}T${meeting.timeEnd}:00`, timezone);
    if (s >= rangeStart && s <= rangeEnd) {
      instances.push({ start: s, end: e });
    }
    return instances;
  }

  // Iterate day-by-day through range (capped at 366 days for safety)
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  const maxIterations = 366;
  let iterations = 0;

  while (cursor <= rangeEnd && iterations < maxIterations) {
    iterations++;
    const zoned = toZonedTime(cursor, timezone);
    const dow = zoned.getDay(); // 0=Sun ... 6=Sat
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
          matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
        } else {
          matches = zoned.getDate() === 1; // first of month
        }
        break;
      case 'QUARTERLY':
        // First occurrence of the day in quarter months (Jan, Apr, Jul, Oct)
        if ([0, 3, 6, 9].includes(zoned.getMonth())) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
          } else {
            matches = zoned.getDate() === 1;
          }
        }
        break;
      case 'YEARLY':
        // Jan 1st or first occurrence of the day in January
        if (zoned.getMonth() === 0) {
          if (meeting.dayOfWeek !== null) {
            matches = dow === meeting.dayOfWeek && zoned.getDate() <= 7;
          } else {
            matches = zoned.getDate() === 1;
          }
        }
        break;
    }

    if (matches) {
      const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
      const eventStart = fromZonedTime(`${dateKey}T${meeting.timeStart}:00`, timezone);
      const eventEnd = fromZonedTime(`${dateKey}T${meeting.timeEnd}:00`, timezone);

      if (eventStart >= rangeStart && eventStart <= rangeEnd) {
        instances.push({ start: eventStart, end: eventEnd });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return instances;
}
