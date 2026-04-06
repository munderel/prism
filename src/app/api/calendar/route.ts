import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { listGoogleEvents, createGoogleEvent, getUserSyncCalendarId } from '@/lib/calendar';
import { generateMeetingInstances, isUserInMeeting } from '@/lib/meeting-utils';
import { matchesMonthlyRule, matchesYearlyRule } from '@/lib/review-dates';
import { parseGoogleSyncState, type GoogleEventOverride } from '@/lib/google-sync-state';
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

/** Convert selectedCalendarIds to a string array.
 *  Returns undefined only when the raw value is not an array (user never configured).
 *  Returns [] when the user explicitly deselected all calendars. */
function parseCalendarIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw as string[];
}

function taskTypeColor(taskType: string): string {
  switch (taskType) {
    case 'IMPROVE': return '#6366f1';
    case 'REACT': return '#eab308';
    default: return '#06b6d4';
  }
}

function applySeriesException(
  dateKey: string,
  defaults: { start: Date; end: Date },
  series?: { overrides?: Record<string, GoogleEventOverride>; cancelledDates?: string[] }
) {
  if (!series) return { ...defaults, cancelled: false };
  if ((series.cancelledDates ?? []).includes(dateKey)) {
    return { ...defaults, cancelled: true };
  }
  const override = series.overrides?.[dateKey];
  if (override) {
    return {
      start: new Date(override.start),
      end: new Date(override.end),
      cancelled: false,
    };
  }
  return { ...defaults, cancelled: false };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  try {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const source = searchParams.get('source'); // 'tasks' | 'google' | 'reviews' | 'meetings' | 'all'

  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return Response.json({ error: 'Invalid date format for start or end' }, { status: 400 });
  }
  if (rangeStart >= rangeEnd) {
    return Response.json({ error: 'start must be before end' }, { status: 400 });
  }

  const userSettings = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true, selectedCalendarIds: true, syncTargetCalendarId: true, calendarColorOverrides: true, googleSyncState: true, powerdownTime: true, weeklyReviewDayOfWeek: true, weeklyReviewTime: true, weeklyReviewDuration: true, monthlyReviewRecurrenceRule: true, monthlyReviewTime: true, monthlyReviewDuration: true, yearlyReviewRecurrenceRule: true, yearlyReviewTime: true, yearlyReviewDuration: true },
  });
  const userTz = userSettings?.timezone ?? 'America/New_York';
  const googleSyncState = parseGoogleSyncState(userSettings?.googleSyncState);
  const targetCalendarId = userSettings?.syncTargetCalendarId || 'primary';
  const parsedCalendarIds = parseCalendarIds(userSettings?.selectedCalendarIds);
  const calendarIds = parsedCalendarIds === undefined
    ? [targetCalendarId]
    : parsedCalendarIds.length > 0
      ? Array.from(new Set([targetCalendarId, ...parsedCalendarIds]))
      : [targetCalendarId];
  const colorOverrides = (userSettings?.calendarColorOverrides && typeof userSettings.calendarColorOverrides === 'object' && !Array.isArray(userSettings.calendarColorOverrides))
    ? (userSettings.calendarColorOverrides as Record<string, string>)
    : {};

  // Availability mode: return busy slots from all sources
  if (searchParams.get('availability') === 'true') {
    const busySlots: { start: string; end: string; title: string }[] = [];

    const [tasks, meetings, googleEvents] = await Promise.all([
      prisma.task.findMany({
        where: {
          OR: [
            { assigneeId: auth.userId },
            { ownerId: auth.userId, assigneeId: null },
          ],
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
  const [tasks, reviews, meetings, googleEvents, pdSessions, aimInstances] = await Promise.all([
    (fetchAll || source === 'tasks')
      ? prisma.task.findMany({
          where: {
            AND: [
              {
                OR: [
                  { assigneeId: auth.userId },
                  { ownerId: auth.userId, assigneeId: null },
                ],
              },
              {
                OR: [
                  { timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
                  { dueDate: { gte: rangeStart, lte: rangeEnd } },
                ],
              },
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
    // Powerdown sessions — needed early for Google Calendar dedup
    (userSettings?.powerdownTime && source !== 'external')
      ? prisma.powerdownSession.findMany({
          where: {
            userId: auth.userId,
            sessionDate: { gte: new Date(rangeStart.getTime() - 2 * 86400000), lte: new Date(rangeEnd.getTime() + 2 * 86400000) },
            OR: [
              { timeBlockStart: { not: null } },
              { timeBlockEnd: { not: null } },
              { calendarEventId: { not: null } },
            ],
          },
          select: { sessionDate: true, timeBlockStart: true, timeBlockEnd: true, calendarEventId: true },
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
      description: task.description,
      start: task.timeBlockStart?.toISOString() ?? task.dueDate?.toISOString(),
      end: task.timeBlockEnd?.toISOString() ?? undefined,
      allDay: !task.timeBlockStart,
      source: 'tasks',
      taskId: task.id,
      itemId: task.id,
      itemType: 'task',
      status: task.status,
      taskType: task.taskType,
      priority: task.priority,
      goalTitle: task.goal?.title,
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
      source: 'reviews',
      reviewId: review.id,
      completed: !!review.completedAt,
      color: review.completedAt ? '#22c55e' : '#f59e0b',
    });
  }

  // Build set of synced calendar event IDs for dedup against Google Calendar.
  // Any Prism item (task, aim, review, meeting) that has a calendarEventId should
  // suppress the corresponding Google event to prevent duplicates.
  const syncedCalendarEventIds = new Set<string>();
  for (const task of tasks) {
    if (task.calendarEventId) syncedCalendarEventIds.add(task.calendarEventId);
  }
  for (const aim of aimInstances) {
    if (aim.calendarEventId) syncedCalendarEventIds.add(aim.calendarEventId);
  }
  for (const review of reviews) {
    if (review.calendarEventId) syncedCalendarEventIds.add(review.calendarEventId);
  }
  for (const meeting of meetings) {
    if (meeting.calendarEventId) syncedCalendarEventIds.add(meeting.calendarEventId);
  }
  // Add powerdown calendarEventIds to dedup set BEFORE processing Google events
  for (const s of pdSessions) {
    if (s.calendarEventId) syncedCalendarEventIds.add(s.calendarEventId);
  }
  for (const reviewSeries of Object.values(googleSyncState.recurringReviews ?? {})) {
    if (reviewSeries?.eventId) syncedCalendarEventIds.add(reviewSeries.eventId);
    for (const override of Object.values(reviewSeries?.overrides ?? {})) {
      if (override.googleEventId) syncedCalendarEventIds.add(override.googleEventId);
    }
  }
  if (googleSyncState.powerdown?.eventId) syncedCalendarEventIds.add(googleSyncState.powerdown.eventId);
  for (const override of Object.values(googleSyncState.powerdown?.overrides ?? {})) {
    if (override.googleEventId) syncedCalendarEventIds.add(override.googleEventId);
  }
  for (const processSeries of Object.values(googleSyncState.processes ?? {})) {
    if (processSeries?.eventId) syncedCalendarEventIds.add(processSeries.eventId);
    for (const override of Object.values(processSeries?.overrides ?? {})) {
      if (override.googleEventId) syncedCalendarEventIds.add(override.googleEventId);
    }
  }

  for (const meeting of meetings) {
    if (!isUserInMeeting(meeting, auth.userId)) {
      console.warn(`[calendar] Meeting "${meeting.title}" skipped — user ${auth.userId} not in attendeeIds:`, meeting.attendeeIds, 'createdById:', meeting.createdById);
      continue;
    }
    for (const instance of generateMeetingInstances(meeting, rangeStart, rangeEnd, userTz)) {
      events.push({
        id: `meeting-${meeting.id}-${instance.start.toISOString()}`,
        title: meeting.title,
        start: instance.start.toISOString(),
        end: instance.end.toISOString(),
        allDay: false,
        source: 'meetings',
        meetingId: meeting.id,
        description: meeting.description,
        cadence: meeting.cadence,
        createdBy: meeting.createdBy.name,
        meetLink: meeting.meetLink,
        color: '#f97316',
      });
    }
  }

  // Build a set of Prism-managed event titles for fallback dedup.
  // If Google returns events with these exact titles on the sync target calendar,
  // they are almost certainly Prism-created recurring events with stale/missing sync state.
  const prismManagedTitles = new Set<string>(['Weekly Review', 'Monthly Review', 'Yearly Review', 'Power Down Ritual']);

  for (const ge of googleEvents) {
    // Skip Google Calendar events that are already represented by Prism items (by ID)
    if (ge.id && syncedCalendarEventIds.has(ge.id)) continue;
    if ((ge as any).recurringEventId && syncedCalendarEventIds.has((ge as any).recurringEventId)) continue;

    // Fallback dedup: skip Google events from the sync target calendar that match
    // Prism-managed titles. These are likely orphaned recurring events from stale sync state.
    const sourceCalId = (ge as any)._sourceCalendarId;
    if (sourceCalId === targetCalendarId && ge.summary && prismManagedTitles.has(ge.summary)) continue;

    const eventColor = colorOverrides[sourceCalId] || (ge as any).colorId || '#9333ea';
    events.push({
      id: `google-${ge.id}`,
      title: ge.summary,
      description: ge.description,
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
      itemId: aim.id,
      itemType: 'aim',
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

    // Build overrides map from any stored session time blocks.
    // Some older dragged sessions still carry calendarEventId values from the
    // pre-series sync model, and excluding them makes Prism hide valid moves.
    const pdOverrides = new Map<string, { start: Date; end: Date }>();
    for (const s of pdSessions) {
      if (!s.timeBlockStart || !s.timeBlockEnd) continue;

      const override = { start: s.timeBlockStart, end: s.timeBlockEnd };
      const zoned = toZonedTime(s.sessionDate, userTz);
      const zonedKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
      const utcKey = s.sessionDate.toISOString().split('T')[0];
      pdOverrides.set(zonedKey, override);
      pdOverrides.set(utcKey, override);
    }

    // Widen iteration by 1 day each side to handle timezone boundary mismatches
    const pdIterStart = new Date(rangeStart.getTime() - 86400000);
    const pdIterEnd = new Date(rangeEnd.getTime() + 86400000);
    const pdSeenDates = new Set<string>();
    forEachDayInRange(pdIterStart, pdIterEnd, userTz, (_zonedCursor, dateKey) => {
      if (pdSeenDates.has(dateKey)) return;
      pdSeenDates.add(dateKey);

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

      const powerdownException = applySeriesException(dateKey, { start: pdStart, end: pdEnd }, googleSyncState.powerdown);
      if (powerdownException.cancelled) return;
      pdStart = powerdownException.start;
      pdEnd = powerdownException.end;

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
    // Build set of dates already covered by DB review records to avoid duplicates.
    // Reviews may store scheduledDate as UTC midnight OR local midnight (via fromZonedTime),
    // so we add both the timezone-aware key and the raw UTC key to handle both formats.
    const existingReviewDates = new Map<string, Set<string>>();
    for (const review of reviews) {
      const type = (review as any).reviewType as string;
      if (!existingReviewDates.has(type)) existingReviewDates.set(type, new Set());
      const set = existingReviewDates.get(type)!;
      // Timezone-aware key (matches forEachDayInRange when scheduledDate is local midnight in UTC)
      const zoned = toZonedTime(review.scheduledDate, userTz);
      set.add(`${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`);
      // Raw UTC date key (matches when scheduledDate was stored as UTC midnight directly)
      set.add(review.scheduledDate.toISOString().split('T')[0]);
    }

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
      // Widen iteration range by 1 day each side to handle UTC/timezone boundary mismatches
      // (pushTimedEvent already filters events outside the actual rangeStart–rangeEnd)
      const reviewIterStart = new Date(rangeStart.getTime() - 86400000);
      const reviewIterEnd = new Date(rangeEnd.getTime() + 86400000);
      forEachDayInRange(reviewIterStart, reviewIterEnd, userTz, (zonedCursor, dateKey) => {
        if (config.matchFn(zonedCursor)) {
          // Skip if a DB Review record already exists for this date+type (prevents duplicates)
          if (existingReviewDates.get(config.type)?.has(dateKey)) return;
          const defaults = {
            start: fromZonedTime(`${dateKey}T${pad2(h)}:${pad2(m)}:00`, userTz),
            end: new Date(fromZonedTime(`${dateKey}T${pad2(h)}:${pad2(m)}:00`, userTz).getTime() + config.duration * 60_000),
          };
          const exception = applySeriesException(dateKey, defaults, googleSyncState.recurringReviews?.[config.type as 'WEEKLY' | 'MONTHLY' | 'YEARLY']);
          if (exception.cancelled) return;
          if (!(exception.start >= rangeStart && exception.start <= rangeEnd)) return;
          events.push({
            id: `${config.idPrefix}-${dateKey}`,
            title: config.title,
            start: exception.start.toISOString(),
            end: exception.end.toISOString(),
            allDay: false,
            source: 'reviews',
            color: config.color,
            link: `/reviews?action=start&type=${config.type}&date=${dateKey}`,
            editable: false,
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
            editable: false,
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
      mode: true,
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
      },
      select: { processId: true, scheduledDate: true, timeBlockStart: true, timeBlockEnd: true, completedAt: true },
    });

    const procOverrides = new Map<string, { start: Date; end: Date }>();
    const procCompletions = new Set<string>();
    for (const ex of processExecutions) {
      const dateKey = ex.scheduledDate.toISOString().split('T')[0];
      const key = `${ex.processId}-${dateKey}`;
      if (ex.timeBlockStart && ex.timeBlockEnd) {
        procOverrides.set(key, { start: ex.timeBlockStart, end: ex.timeBlockEnd });
      }
      if (ex.completedAt) {
        procCompletions.add(key);
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
              // Use UTC midnight of the zoned date for consistent epoch week parity (matches meeting-utils)
              const weekNum = Math.floor(fromZonedTime(`${dateKey}T00:00:00`, userTz).getTime() / (7 * 24 * 60 * 60 * 1000));
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

        const processException = applySeriesException(dateKey, { start: evStart, end: evEnd }, googleSyncState.processes?.[proc.id]);
        if (processException.cancelled) return;
        evStart = processException.start;
        evEnd = processException.end;

        if (evStart >= rangeStart && evStart <= rangeEnd) {
          const completionKey = `${proc.id}-${dateKey}`;
          const completed = procCompletions.has(completionKey);
          events.push({
            id: `process-${proc.id}-${dateKey}`,
            title: proc.title,
            start: evStart.toISOString(),
            end: evEnd.toISOString(),
            allDay: false,
            source: 'processes',
            processId: proc.id,
            processMode: proc.mode,
            completed,
            color: completed ? '#22c55e' : '#06b6d4',
            link: '/processes',
          });
        }
      });
    }
  }

  if (events.length === 0) {
    console.warn(`[calendar] 0 events returned for user ${auth.userId}, range ${start} – ${end}, source=${source}`);
  }

  // Debug: count events by source
  const sourceCounts: Record<string, number> = {};
  for (const e of events) {
    const s = (e as any).source ?? 'unknown';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }

  return Response.json({ events, googleStatus, googleError, _debug: { sourceCounts, total: events.length, range: `${start} – ${end}` } });

  } catch (err) {
    console.error('[calendar] Unhandled error in GET /api/calendar:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const stack = err instanceof Error ? err.stack : undefined;
    return Response.json({ error: message, stack: process.env.NODE_ENV !== 'production' ? stack : undefined }, { status: 500 });
  }
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

