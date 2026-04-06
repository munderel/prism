import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import {
  listGoogleEvents,
  createGoogleEvent,
  deleteGoogleEvent,
  updateGoogleEvent,
  buildWeeklyReviewRecurrence,
  buildMonthlyReviewRecurrence,
  buildYearlyReviewRecurrence,
  buildPowerdownRecurrence,
  buildProcessRecurrence,
} from '@/lib/calendar';
import { getCompletionUrl, getAimCompletionUrl, getBaseUrl } from '@/lib/completion-token';
import {
  cloneGoogleSyncState,
  parseGoogleSyncState,
  type GoogleSyncState,
  type ManagedRecurringSeriesState,
} from '@/lib/google-sync-state';
import { matchesMonthlyRule, matchesYearlyRule } from '@/lib/review-dates';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const MAX_DAYS = 366;
const pad2 = (n: number) => String(n).padStart(2, '0');

type GoogleEventLike = {
  id?: string | null;
  summary?: string | null;
  status?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  recurringEventId?: string | null;
  originalStartTime?: { dateTime?: string | null; date?: string | null } | null;
  updated?: string | null;
};

type SeriesConfig = {
  key: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone: string;
  recurrence: string[];
  defaultsByDate: Map<string, { start: string; end: string }>;
};

function getEventStartString(event: GoogleEventLike) {
  return event.start?.dateTime ?? event.start?.date ?? null;
}

function getEventEndString(event: GoogleEventLike) {
  return event.end?.dateTime ?? event.end?.date ?? null;
}

function getOriginalDateKey(event: GoogleEventLike, timezone: string) {
  const raw = event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? getEventStartString(event);
  if (!raw) return null;
  const zoned = toZonedTime(new Date(raw), timezone);
  return `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
}

function hasTimeDrifted(startA: string, endA: string, startB: string, endB: string) {
  return (
    Math.abs(new Date(startA).getTime() - new Date(startB).getTime()) > 60000 ||
    Math.abs(new Date(endA).getTime() - new Date(endB).getTime()) > 60000
  );
}

function forEachDayInRange(rangeStart: Date, rangeEnd: Date, timezone: string, onDay: (dateKey: string, zonedDate: Date) => void) {
  const cursor = new Date(rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  let count = 0;

  while (cursor <= rangeEnd && count < MAX_DAYS) {
    count++;
    const zoned = toZonedTime(cursor, timezone);
    const dateKey = `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
    onDay(dateKey, zoned);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function buildTimedWindow(dateKey: string, time: string, duration: number, timezone: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const start = fromZonedTime(`${dateKey}T${pad2(hours)}:${pad2(minutes)}:00`, timezone);
  const end = new Date(start.getTime() + duration * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function findFirstMatchingWindow(
  rangeStart: Date,
  timezone: string,
  matchFn: (zonedDate: Date) => boolean,
  time: string,
  duration: number,
): { start: string; end: string } | null {
  const searchEnd = new Date(rangeStart.getTime() + MAX_DAYS * 86400000);
  let firstWindow: { start: string; end: string } | null = null;

  forEachDayInRange(rangeStart, searchEnd, timezone, (dateKey, zonedDate) => {
    if (firstWindow || !matchFn(zonedDate)) return;
    firstWindow = buildTimedWindow(dateKey, time, duration, timezone);
  });

  return firstWindow;
}

function syncSeriesExceptions(
  state: ManagedRecurringSeriesState | undefined,
  matchingEvents: GoogleEventLike[],
  defaultsByDate: Map<string, { start: string; end: string }>,
  timezone: string,
): ManagedRecurringSeriesState | undefined {
  if (!state?.eventId) return state;

  const nextState: ManagedRecurringSeriesState = {
    ...state,
    overrides: { ...(state.overrides ?? {}) },
    cancelledDates: [...(state.cancelledDates ?? [])],
    lastSyncedAt: new Date().toISOString(),
  };
  const cancelled = new Set(nextState.cancelledDates);

  for (const event of matchingEvents) {
    const dateKey = getOriginalDateKey(event, timezone);
    if (!dateKey) continue;

    const defaultWindow = defaultsByDate.get(dateKey);
    if (!defaultWindow) continue;

    if (event.status === 'cancelled') {
      cancelled.add(dateKey);
      delete nextState.overrides?.[dateKey];
      continue;
    }

    const eventStart = getEventStartString(event);
    const eventEnd = getEventEndString(event);
    if (!eventStart || !eventEnd) continue;

    if (hasTimeDrifted(eventStart, eventEnd, defaultWindow.start, defaultWindow.end)) {
      nextState.overrides![dateKey] = {
        googleEventId: event.id ?? undefined,
        start: eventStart,
        end: eventEnd,
        updatedAt: event.updated ?? undefined,
      };
      cancelled.delete(dateKey);
    } else {
      delete nextState.overrides?.[dateKey];
      cancelled.delete(dateKey);
    }
  }

  nextState.cancelledDates = Array.from(cancelled).sort();
  if (nextState.overrides && Object.keys(nextState.overrides).length === 0) delete nextState.overrides;
  if (nextState.cancelledDates.length === 0) delete nextState.cancelledDates;
  return nextState;
}

async function upsertRecurringSeries(
  userId: string,
  calendarId: string,
  current: ManagedRecurringSeriesState | undefined,
  config: SeriesConfig | null,
) {
  if (!config) {
    if (current?.eventId) {
      await deleteGoogleEvent(userId, current.eventId, calendarId).catch(() => {});
    }
    return undefined;
  }

  if (current?.eventId) {
    const updated = await updateGoogleEvent(userId, current.eventId, {
      summary: config.title,
      description: config.description,
      start: config.start,
      end: config.end,
      timeZone: config.timeZone,
      recurrence: config.recurrence,
    }, calendarId);

    if (updated?.id) {
      return {
        ...current,
        eventId: updated.id,
        lastSyncedAt: new Date().toISOString(),
      } satisfies ManagedRecurringSeriesState;
    }

    // Event no longer exists in Google — clear stale override/cancellation state
    console.warn(`[calendar] Recurring event ${current.eventId} not found in Google, creating fresh series for ${config.key}`);
  }

  const created = await createGoogleEvent(userId, {
    summary: config.title,
    description: config.description,
    start: config.start,
    end: config.end,
    timeZone: config.timeZone,
    recurrence: config.recurrence,
  }, calendarId);

  if (!created?.id) return undefined;

  return {
    eventId: created.id,
    lastSyncedAt: new Date().toISOString(),
  } satisfies ManagedRecurringSeriesState;
}

function buildReviewSeriesConfigs(user: any, timezone: string, rangeStart: Date, rangeEnd: Date, baseUrl: string) {
  const configs: Partial<Record<'WEEKLY' | 'MONTHLY' | 'YEARLY', SeriesConfig>> = {};

  if (user.weeklyReviewDayOfWeek != null && user.weeklyReviewTime) {
    const recurrence = buildWeeklyReviewRecurrence(user.weeklyReviewDayOfWeek);
    const duration = user.weeklyReviewDuration ?? 60;
    const first = findFirstMatchingWindow(
      rangeStart,
      timezone,
      (date) => date.getDay() === user.weeklyReviewDayOfWeek,
      user.weeklyReviewTime,
      duration,
    );

    if (recurrence && first) {
      const defaultsByDate = new Map<string, { start: string; end: string }>();
      forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey, zonedDate) => {
        if (zonedDate.getDay() !== user.weeklyReviewDayOfWeek) return;
        defaultsByDate.set(dateKey, buildTimedWindow(dateKey, user.weeklyReviewTime, duration, timezone));
      });
      configs.WEEKLY = {
        key: 'WEEKLY',
        title: 'Weekly Review',
        description: `Start your Weekly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
      };
    }
  }

  if (user.monthlyReviewRecurrenceRule && user.monthlyReviewTime) {
    const recurrence = buildMonthlyReviewRecurrence(user.monthlyReviewRecurrenceRule);
    const duration = user.monthlyReviewDuration ?? 60;
    const first = findFirstMatchingWindow(
      rangeStart,
      timezone,
      (date) => matchesMonthlyRule(date, user.monthlyReviewRecurrenceRule),
      user.monthlyReviewTime,
      duration,
    );

    if (recurrence && first) {
      const defaultsByDate = new Map<string, { start: string; end: string }>();
      forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey, zonedDate) => {
        if (!matchesMonthlyRule(zonedDate, user.monthlyReviewRecurrenceRule)) return;
        defaultsByDate.set(dateKey, buildTimedWindow(dateKey, user.monthlyReviewTime, duration, timezone));
      });
      configs.MONTHLY = {
        key: 'MONTHLY',
        title: 'Monthly Review',
        description: `Start your Monthly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
      };
    }
  }

  if (user.yearlyReviewRecurrenceRule && user.yearlyReviewTime) {
    const recurrence = buildYearlyReviewRecurrence(user.yearlyReviewRecurrenceRule);
    const duration = user.yearlyReviewDuration ?? 90;
    const first = findFirstMatchingWindow(
      rangeStart,
      timezone,
      (date) => matchesYearlyRule(date, user.yearlyReviewRecurrenceRule),
      user.yearlyReviewTime,
      duration,
    );

    if (recurrence && first) {
      const defaultsByDate = new Map<string, { start: string; end: string }>();
      forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey, zonedDate) => {
        if (!matchesYearlyRule(zonedDate, user.yearlyReviewRecurrenceRule)) return;
        defaultsByDate.set(dateKey, buildTimedWindow(dateKey, user.yearlyReviewTime, duration, timezone));
      });
      configs.YEARLY = {
        key: 'YEARLY',
        title: 'Yearly Review',
        description: `Start your Yearly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
      };
    }
  }

  return configs;
}

function buildPowerdownSeriesConfig(user: any, timezone: string, rangeStart: Date, rangeEnd: Date, baseUrl: string): SeriesConfig | null {
  if (!user.powerdownTime) return null;
  const firstDateKey = `${toZonedTime(rangeStart, timezone).getFullYear()}-${pad2(toZonedTime(rangeStart, timezone).getMonth() + 1)}-${pad2(toZonedTime(rangeStart, timezone).getDate())}`;
  const firstWindow = buildTimedWindow(firstDateKey, user.powerdownTime, 30, timezone);
  const defaultsByDate = new Map<string, { start: string; end: string }>();

  forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey) => {
    defaultsByDate.set(dateKey, buildTimedWindow(dateKey, user.powerdownTime, 30, timezone));
  });

  return {
    key: 'powerdown',
    title: 'Power Down Ritual',
    description: `Start your Power Down Ritual in Prism: ${baseUrl}/powerdown`,
    start: firstWindow.start,
    end: firstWindow.end,
    timeZone: timezone,
    recurrence: buildPowerdownRecurrence(),
    defaultsByDate,
  };
}

function processMatchesOnDate(process: any, zonedDate: Date) {
  const dow = zonedDate.getDay();
  switch (process.cadence) {
    case 'DAILY':
      return process.scheduledDayOfWeek == null ? dow >= 1 && dow <= 5 : true;
    case 'WEEKLY':
      return dow === (process.scheduledDayOfWeek ?? 1);
    case 'BIWEEKLY': {
      const targetDow = process.scheduledDayOfWeek ?? 1;
      if (dow !== targetDow) return false;
      const weekNum = Math.floor(zonedDate.getTime() / (7 * 24 * 60 * 60 * 1000));
      return weekNum % 2 === 0;
    }
    case 'MONTHLY':
      return zonedDate.getDate() === (process.scheduledDayOfMonth ?? 1);
    case 'QUARTERLY':
      return [0, 3, 6, 9].includes(zonedDate.getMonth()) && zonedDate.getDate() === (process.scheduledDayOfMonth ?? 1);
    case 'YEARLY':
      return zonedDate.getMonth() === 0 && zonedDate.getDate() === 1;
    default:
      return false;
  }
}

function buildProcessSeriesConfig(process: any, timezone: string, rangeStart: Date, rangeEnd: Date): SeriesConfig | null {
  if (!process.scheduledTime || process.cadence === 'ONE_TIME') return null;
  const recurrence = buildProcessRecurrence(process);
  if (!recurrence) return null;

  const duration = process.defaultDurationMinutes ?? 60;
  const first = findFirstMatchingWindow(
    rangeStart,
    timezone,
    (date) => processMatchesOnDate(process, date),
    process.scheduledTime,
    duration,
  );

  if (!first) return null;

  const defaultsByDate = new Map<string, { start: string; end: string }>();
  forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey, zonedDate) => {
    if (!processMatchesOnDate(process, zonedDate)) return;
    defaultsByDate.set(dateKey, buildTimedWindow(dateKey, process.scheduledTime, duration, timezone));
  });

  return {
    key: process.id,
    title: process.title,
    description: `Recurring process in Prism: ${process.title}`,
    start: first.start,
    end: first.end,
    timeZone: timezone,
    recurrence,
    defaultsByDate,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { start, end } = parsed.data;
  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 });
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      googleRefreshToken: true,
      syncTargetCalendarId: true,
      selectedCalendarIds: true,
      timezone: true,
      powerdownTime: true,
      weeklyReviewDayOfWeek: true,
      weeklyReviewTime: true,
      weeklyReviewDuration: true,
      monthlyReviewRecurrenceRule: true,
      monthlyReviewTime: true,
      monthlyReviewDuration: true,
      yearlyReviewRecurrenceRule: true,
      yearlyReviewTime: true,
      yearlyReviewDuration: true,
      googleSyncState: true,
    },
  });

  if (!user?.googleRefreshToken) {
    return Response.json({ error: 'Google Calendar is not connected.' }, { status: 400 });
  }

  const targetCalendarId = user.syncTargetCalendarId || 'primary';
  const rawIds = Array.isArray(user.selectedCalendarIds) ? (user.selectedCalendarIds as string[]) : undefined;
  const calendarIds = rawIds === undefined
    ? [targetCalendarId]
    : rawIds.length > 0
      ? Array.from(new Set([targetCalendarId, ...rawIds]))
      : [targetCalendarId];
  const timezone = user.timezone ?? 'America/New_York';
  const baseUrl = getBaseUrl();

  const [gcalEvents, tasks, aimInstances, processes, reviews, powerdownSessions] = await Promise.all([
    listGoogleEvents(auth.userId, start, end, calendarIds, { showDeleted: true }),
    prisma.task.findMany({
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
              { calendarEventId: { not: null }, timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
              { calendarEventId: null, timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd }, timeBlockEnd: { not: null }, status: { notIn: ['DONE', 'DROPPED'] } },
            ],
          },
        ],
      },
      select: { id: true, title: true, description: true, calendarEventId: true, timeBlockStart: true, timeBlockEnd: true },
    }),
    prisma.aimInstance.findMany({
      where: {
        userId: auth.userId,
        OR: [
          { calendarEventId: { not: null }, timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
          { calendarEventId: null, timeBlockStart: { not: null, gte: rangeStart, lte: rangeEnd }, timeBlockEnd: { not: null }, status: { not: 'SKIPPED' } },
        ],
      },
      include: { aimCategory: { select: { name: true } } },
    }),
    prisma.process.findMany({
      where: {
        scheduledTime: { not: null },
        cadence: { not: 'ONE_TIME' },
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
    }),
    prisma.review.findMany({
      where: {
        userId: auth.userId,
        completedAt: null,
        calendarEventId: { not: null },
        OR: [
          { scheduledDate: { gte: new Date(rangeStart.getTime() - 86400000), lte: new Date(rangeEnd.getTime() + 86400000) } },
          { timeBlockStart: { gte: rangeStart, lte: rangeEnd } },
        ],
      },
      select: { id: true, reviewType: true, calendarEventId: true },
    }),
    prisma.powerdownSession.findMany({
      where: {
        userId: auth.userId,
        calendarEventId: { not: null },
        sessionDate: { gte: new Date(rangeStart.getTime() - 86400000), lte: new Date(rangeEnd.getTime() + 86400000) },
      },
      select: { id: true, calendarEventId: true, sessionDate: true },
    }),
  ]);

  const googleSyncState = cloneGoogleSyncState(parseGoogleSyncState(user.googleSyncState));
  const updates: string[] = [];

  const gcalById = new Map<string, GoogleEventLike>();
  for (const event of gcalEvents as GoogleEventLike[]) {
    if (event.id) gcalById.set(event.id, event);
  }

  // Pull one-off linked task changes from Google.
  for (const task of tasks.filter((item) => item.calendarEventId)) {
    const event = task.calendarEventId ? gcalById.get(task.calendarEventId) : null;
    if (event?.status === 'cancelled') {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled task from Google deletion: ${task.title}`);
      continue;
    }

    const eventStart = event ? getEventStartString(event) : null;
    const eventEnd = event ? getEventEndString(event) : null;
    if (!eventStart || !eventEnd || !task.timeBlockStart || !task.timeBlockEnd) continue;

    if (hasTimeDrifted(eventStart, eventEnd, task.timeBlockStart.toISOString(), task.timeBlockEnd.toISOString())) {
      await prisma.task.update({
        where: { id: task.id },
        data: { timeBlockStart: new Date(eventStart), timeBlockEnd: new Date(eventEnd), dueDate: new Date(eventStart) },
      });
      updates.push(`Pulled task move from Google: ${task.title}`);
    }
  }

  // Pull one-off linked aim changes from Google.
  for (const aim of aimInstances.filter((item) => item.calendarEventId)) {
    const event = aim.calendarEventId ? gcalById.get(aim.calendarEventId) : null;
    const aimTitle = aim.selectedActivity ? `${aim.aimCategory.name}: ${aim.selectedActivity}` : aim.aimCategory.name;

    if (event?.status === 'cancelled') {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: null, timeBlockEnd: null, calendarEventId: null },
      });
      updates.push(`Unscheduled aim from Google deletion: ${aimTitle}`);
      continue;
    }

    const eventStart = event ? getEventStartString(event) : null;
    const eventEnd = event ? getEventEndString(event) : null;
    if (!eventStart || !eventEnd || !aim.timeBlockStart || !aim.timeBlockEnd) continue;

    if (hasTimeDrifted(eventStart, eventEnd, aim.timeBlockStart.toISOString(), aim.timeBlockEnd.toISOString())) {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: new Date(eventStart), timeBlockEnd: new Date(eventEnd) },
      });
      updates.push(`Pulled aim move from Google: ${aimTitle}`);
    }
  }

  // Push one-off unsynced tasks.
  for (const task of tasks.filter((item) => !item.calendarEventId && item.timeBlockStart && item.timeBlockEnd)) {
    const completionUrl = getCompletionUrl(task.id, auth.userId);
    const description = task.description
      ? `${task.description}\n\nMark complete in Prism: ${completionUrl}`
      : `Mark complete in Prism: ${completionUrl}`;
    const event = await createGoogleEvent(auth.userId, {
      summary: task.title,
      description,
      start: task.timeBlockStart!.toISOString(),
      end: task.timeBlockEnd!.toISOString(),
    }, targetCalendarId);

    if (event?.id) {
      await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: event.id } });
      updates.push(`Pushed task to Google: ${task.title}`);
    }
  }

  // Push one-off unsynced aims.
  for (const aim of aimInstances.filter((item) => !item.calendarEventId && item.timeBlockStart && item.timeBlockEnd)) {
    const title = aim.selectedActivity ? `${aim.aimCategory.name}: ${aim.selectedActivity}` : aim.aimCategory.name;
    const completionUrl = getAimCompletionUrl(aim.id, auth.userId);
    const event = await createGoogleEvent(auth.userId, {
      summary: title,
      description: `Mark complete in Prism: ${completionUrl}`,
      start: aim.timeBlockStart!.toISOString(),
      end: aim.timeBlockEnd!.toISOString(),
    }, targetCalendarId);

    if (event?.id) {
      await prisma.aimInstance.update({ where: { id: aim.id }, data: { calendarEventId: event.id } });
      updates.push(`Pushed aim to Google: ${title}`);
    }
  }

  // Remove legacy one-off review events now that reviews are managed as recurring series.
  const activeRecurringReviewTypes = new Set<('WEEKLY' | 'MONTHLY' | 'YEARLY')>();
  if (user.weeklyReviewDayOfWeek != null && user.weeklyReviewTime) activeRecurringReviewTypes.add('WEEKLY');
  if (user.monthlyReviewRecurrenceRule && user.monthlyReviewTime) activeRecurringReviewTypes.add('MONTHLY');
  if (user.yearlyReviewRecurrenceRule && user.yearlyReviewTime) activeRecurringReviewTypes.add('YEARLY');

  for (const review of reviews) {
    if (!review.calendarEventId) continue;
    if (!activeRecurringReviewTypes.has(review.reviewType)) continue;
    await deleteGoogleEvent(auth.userId, review.calendarEventId, targetCalendarId).catch(() => {});
    await prisma.review.update({
      where: { id: review.id },
      data: { calendarEventId: null },
    });
    updates.push(`Removed legacy ${review.reviewType.toLowerCase()} review event`);
  }

  // Remove legacy one-off powerdown events now that powerdown is managed as a recurring series.
  if (user.powerdownTime) {
    for (const session of powerdownSessions) {
      if (!session.calendarEventId) continue;
      await deleteGoogleEvent(auth.userId, session.calendarEventId, targetCalendarId).catch(() => {});
      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { calendarEventId: null },
      });
      updates.push('Removed legacy powerdown event');
    }
  }

  // Recurring review series.
  const reviewConfigs = buildReviewSeriesConfigs(user, timezone, rangeStart, rangeEnd, baseUrl);
  googleSyncState.recurringReviews = googleSyncState.recurringReviews ?? {};

  for (const reviewType of ['WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
    const currentSeries = googleSyncState.recurringReviews[reviewType];
    const config = reviewConfigs[reviewType] ?? null;
    const nextSeries = await upsertRecurringSeries(auth.userId, targetCalendarId, currentSeries, config);

    if (config && nextSeries?.eventId) {
      const matchingEvents = (gcalEvents as GoogleEventLike[]).filter((event) => event.recurringEventId === nextSeries.eventId);
      const syncedSeries = syncSeriesExceptions(nextSeries, matchingEvents, config.defaultsByDate, timezone);
      if (syncedSeries) {
        googleSyncState.recurringReviews[reviewType] = syncedSeries;
        updates.push(`Synced ${reviewType.toLowerCase()} review series`);
      }
    } else {
      delete googleSyncState.recurringReviews[reviewType];
    }
  }

  // Recurring powerdown series.
  const powerdownConfig = buildPowerdownSeriesConfig(user, timezone, rangeStart, rangeEnd, baseUrl);
  const nextPowerdown = await upsertRecurringSeries(auth.userId, targetCalendarId, googleSyncState.powerdown, powerdownConfig);
  if (powerdownConfig && nextPowerdown?.eventId) {
    const matchingEvents = (gcalEvents as GoogleEventLike[]).filter((event) => event.recurringEventId === nextPowerdown.eventId);
    const syncedPowerdown = syncSeriesExceptions(nextPowerdown, matchingEvents, powerdownConfig.defaultsByDate, timezone);
    if (syncedPowerdown) {
      googleSyncState.powerdown = syncedPowerdown;
      updates.push('Synced powerdown series');
    }
  } else {
    delete googleSyncState.powerdown;
  }

  // Recurring process series.
  googleSyncState.processes = googleSyncState.processes ?? {};
  const liveProcessIds = new Set<string>();

  for (const process of processes) {
    liveProcessIds.add(process.id);
    const config = buildProcessSeriesConfig(process, timezone, rangeStart, rangeEnd);
    const nextSeries = await upsertRecurringSeries(auth.userId, targetCalendarId, googleSyncState.processes[process.id], config);

    if (config && nextSeries?.eventId) {
      const matchingEvents = (gcalEvents as GoogleEventLike[]).filter((event) => event.recurringEventId === nextSeries.eventId);
      const syncedSeries = syncSeriesExceptions(nextSeries, matchingEvents, config.defaultsByDate, timezone);
      if (syncedSeries) {
        googleSyncState.processes[process.id] = syncedSeries;
        updates.push(`Synced process series: ${process.title}`);
      }
    } else {
      delete googleSyncState.processes[process.id];
    }
  }

  for (const staleProcessId of Object.keys(googleSyncState.processes)) {
    if (liveProcessIds.has(staleProcessId)) continue;
    const stale = googleSyncState.processes[staleProcessId];
    if (stale?.eventId) {
      await deleteGoogleEvent(auth.userId, stale.eventId, targetCalendarId).catch(() => {});
    }
    delete googleSyncState.processes[staleProcessId];
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { googleSyncState: googleSyncState as Prisma.InputJsonValue },
  });

  return Response.json({
    synced: true,
    updates,
    googleEventCount: gcalEvents.length,
    oneOffTasksChecked: tasks.length,
    oneOffAimsChecked: aimInstances.length,
    recurringReviewSeries: Object.keys(googleSyncState.recurringReviews ?? {}).length,
    recurringProcessSeries: Object.keys(googleSyncState.processes ?? {}).length,
  });
}
