import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, syncCalendarSchema } from '@/lib/schemas';
import {
  listGoogleEvents,
  listAllTaggedPrismMasters,
  listWritableCalendarIds,
  listUntaggedPrismLookalikes,
  createGoogleEvent,
  deleteGoogleEvent,
  safeDeleteGoogleEvent,
  updateGoogleEvent,
  buildWeeklyReviewRecurrence,
  buildMonthlyReviewRecurrence,
  buildYearlyReviewRecurrence,
  buildPowerdownRecurrence,
  buildProcessRecurrence,
  type PrismEventType,
} from '@/lib/calendar';
import { getCompletionUrl, getAimCompletionUrl, getBaseUrl } from '@/lib/completion-token';
import {
  cloneGoogleSyncState,
  parseGoogleSyncState,
  pad2,
  getDateKey,
  parseLocalDateKey,
  type ManagedRecurringSeriesState,
} from '@/lib/google-sync-state';
import { matchesMonthlyRule, matchesYearlyRule } from '@/lib/review-dates';
import { parseDateOnly } from '@/lib/date-utils';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const MAX_DAYS = 366;

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
  // Globally-unique tag written to the Google event's
  // `extendedProperties.private.prismRecordId` so a future sync can find the
  // series even if `googleSyncState` was wiped (e.g. after force-resync).
  recordKey: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone: string;
  recurrence: string[];
  defaultsByDate: Map<string, { start: string; end: string }>;
  prismType: PrismEventType;
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
  return getDateKey(new Date(raw), timezone);
}

// 5-second threshold absorbs Google's millisecond rounding and tiny TZ
// normalization differences without silently discarding real user moves.
// The previous 60-second threshold dropped any drag under a minute, which
// looked like a snap-back to the user.
const DRIFT_THRESHOLD_MS = 5_000;

function hasTimeDrifted(startA: string, endA: string, startB: string, endB: string, label?: string) {
  const dStart = Math.abs(new Date(startA).getTime() - new Date(startB).getTime());
  const dEnd = Math.abs(new Date(endA).getTime() - new Date(endB).getTime());
  const drifted = dStart > DRIFT_THRESHOLD_MS || dEnd > DRIFT_THRESHOLD_MS;
  if (!drifted && (dStart > 0 || dEnd > 0)) {
    console.info(
      `[calendar] ignoring sub-threshold drift${label ? ` (${label})` : ''}: Δstart=${dStart}ms Δend=${dEnd}ms`,
    );
  }
  return drifted;
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

async function applyReviewOverridesToPrism(
  userId: string,
  reviewType: 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  series: ManagedRecurringSeriesState | undefined,
  timezone: string,
  updates: string[],
) {
  if (!series) return;

  // Apply overrides (moved instances) back to Review records
  if (series.overrides) {
    await Promise.all(Object.entries(series.overrides).map(async ([dateKey, override]) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const review = await prisma.review.findFirst({
        where: {
          userId,
          reviewType,
          completedAt: null,
          scheduledDate: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, updatedAt: true, timeBlockStart: true, timeBlockEnd: true },
      });

      if (!review) return;

      const googleUpdatedAt = override.updatedAt ? new Date(override.updatedAt) : null;
      const prismUpdatedAt = review.updatedAt;

      // Last-write-wins: only apply Google's change if it's newer
      if (googleUpdatedAt && prismUpdatedAt && googleUpdatedAt <= prismUpdatedAt) return;

      const newStart = new Date(override.start);
      const newEnd = new Date(override.end);

      // Skip if times already match
      if (
        review.timeBlockStart &&
        review.timeBlockEnd &&
        !hasTimeDrifted(
          review.timeBlockStart.toISOString(),
          review.timeBlockEnd.toISOString(),
          override.start,
          override.end,
        )
      ) return;

      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: newStart, timeBlockEnd: newEnd },
      });
      updates.push(`Pulled ${reviewType.toLowerCase()} review time change from Google (${dateKey})`);
    }));
  }

  // Apply cancellations back to Review records
  if (series.cancelledDates) {
    await Promise.all(series.cancelledDates.map(async (dateKey) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const review = await prisma.review.findFirst({
        where: {
          userId,
          reviewType,
          completedAt: null,
          scheduledDate: { gte: dayStart, lt: dayEnd },
          OR: [
            { timeBlockStart: { not: null } },
            { timeBlockEnd: { not: null } },
          ],
        },
        select: { id: true },
      });

      if (!review) return;

      await prisma.review.update({
        where: { id: review.id },
        data: { timeBlockStart: null, timeBlockEnd: null },
      });
      updates.push(`Cleared ${reviewType.toLowerCase()} review time block from Google cancellation (${dateKey})`);
    }));
  }
}

async function applyPowerdownOverridesToPrism(
  userId: string,
  series: ManagedRecurringSeriesState | undefined,
  timezone: string,
  updates: string[],
) {
  if (!series) return;

  // Apply overrides (moved instances) back to PowerdownSession records
  if (series.overrides) {
    await Promise.all(Object.entries(series.overrides).map(async ([dateKey, override]) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const session = await prisma.powerdownSession.findFirst({
        where: {
          userId,
          sessionDate: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, updatedAt: true, timeBlockStart: true, timeBlockEnd: true },
      });

      if (!session) return;

      const googleUpdatedAt = override.updatedAt ? new Date(override.updatedAt) : null;
      const prismUpdatedAt = session.updatedAt;

      // Last-write-wins: only apply Google's change if it's newer
      if (googleUpdatedAt && prismUpdatedAt && googleUpdatedAt <= prismUpdatedAt) return;

      const newStart = new Date(override.start);
      const newEnd = new Date(override.end);

      // Skip if times already match
      if (
        session.timeBlockStart &&
        session.timeBlockEnd &&
        !hasTimeDrifted(
          session.timeBlockStart.toISOString(),
          session.timeBlockEnd.toISOString(),
          override.start,
          override.end,
        )
      ) return;

      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { timeBlockStart: newStart, timeBlockEnd: newEnd },
      });
      updates.push(`Pulled powerdown time change from Google (${dateKey})`);
    }));
  }

  // Apply cancellations back to PowerdownSession records
  if (series.cancelledDates) {
    await Promise.all(series.cancelledDates.map(async (dateKey) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const session = await prisma.powerdownSession.findFirst({
        where: {
          userId,
          sessionDate: { gte: dayStart, lt: dayEnd },
          OR: [
            { timeBlockStart: { not: null } },
            { timeBlockEnd: { not: null } },
          ],
        },
        select: { id: true },
      });

      if (!session) return;

      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { timeBlockStart: null, timeBlockEnd: null },
      });
      updates.push(`Cleared powerdown time block from Google cancellation (${dateKey})`);
    }));
  }
}

async function applyProcessOverridesToPrism(
  userId: string,
  processId: string,
  series: ManagedRecurringSeriesState | undefined,
  timezone: string,
  updates: string[],
) {
  if (!series) return;

  // Apply overrides (moved instances) back to ProcessExecution records
  if (series.overrides) {
    await Promise.all(Object.entries(series.overrides).map(async ([dateKey, override]) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const execution = await prisma.processExecution.findFirst({
        where: {
          processId,
          executedById: userId,
          scheduledDate: { gte: dayStart, lt: dayEnd },
          completedAt: null,
        },
        select: { id: true, timeBlockStart: true, timeBlockEnd: true },
      });

      if (!execution) return;

      // Skip if times already match
      if (
        execution.timeBlockStart &&
        execution.timeBlockEnd &&
        !hasTimeDrifted(
          execution.timeBlockStart.toISOString(),
          execution.timeBlockEnd.toISOString(),
          override.start,
          override.end,
        )
      ) return;

      await prisma.processExecution.update({
        where: { id: execution.id },
        data: {
          timeBlockStart: new Date(override.start),
          timeBlockEnd: new Date(override.end),
        },
      });
      updates.push(`Pulled process execution time change from Google (${dateKey})`);
    }));
  }

  // Apply cancellations back to ProcessExecution records
  if (series.cancelledDates) {
    await Promise.all(series.cancelledDates.map(async (dateKey) => {
      const dayStart = parseLocalDateKey(dateKey, timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const execution = await prisma.processExecution.findFirst({
        where: {
          processId,
          executedById: userId,
          scheduledDate: { gte: dayStart, lt: dayEnd },
          completedAt: null,
          OR: [{ timeBlockStart: { not: null } }, { timeBlockEnd: { not: null } }],
        },
        select: { id: true },
      });

      if (!execution) return;

      await prisma.processExecution.update({
        where: { id: execution.id },
        data: { timeBlockStart: null, timeBlockEnd: null },
      });
      updates.push(`Cleared process execution time block from Google cancellation (${dateKey})`);
    }));
  }
}

type OrphanLookup = (recordKey: string) => GoogleEventLike | undefined;

async function upsertRecurringSeries(
  userId: string,
  calendarId: string,
  current: ManagedRecurringSeriesState | undefined,
  config: SeriesConfig | null,
  orphanLookup?: OrphanLookup,
) {
  if (!config) {
    if (current?.eventId) {
      await deleteGoogleEvent(userId, current.eventId, calendarId).catch(() => {});
    }
    return undefined;
  }

  if (current?.eventId) {
    try {
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

      // null return means 404/410 — event genuinely gone, fall through to recreate
      console.warn(`[calendar] Recurring event ${current.eventId} not found in Google, creating fresh series for ${config.key}`);
    } catch (err) {
      // Transient error (network, rate limit, auth) — keep existing state to avoid creating a duplicate
      console.warn(`[calendar] Transient error updating ${config.key} series, keeping existing event ID:`, err);
      return current;
    }
  }

  // Dedup before insert: a prior force-resync may have wiped googleSyncState
  // but the actual Google event survived (silent delete failure). The caller
  // passes a lookup over `allTaggedMasters` (singleEvents=false), so each entry
  // is already a master/one-off — `event.id` is the deletable handle.
  const existingMaster = orphanLookup?.(config.recordKey);
  const existingMasterId = existingMaster?.id;
  if (existingMasterId) {
    try {
      const updated = await updateGoogleEvent(userId, existingMasterId, {
        summary: config.title,
        description: config.description,
        start: config.start,
        end: config.end,
        timeZone: config.timeZone,
        recurrence: config.recurrence,
      }, calendarId);
      if (updated?.id) {
        return {
          eventId: updated.id,
          lastSyncedAt: new Date().toISOString(),
        } satisfies ManagedRecurringSeriesState;
      }
    } catch (err) {
      console.warn(`[calendar] Found orphan series for ${config.recordKey} but update failed; falling through to insert:`, err);
    }
  }

  const created = await createGoogleEvent(userId, {
    summary: config.title,
    description: config.description,
    start: config.start,
    end: config.end,
    timeZone: config.timeZone,
    recurrence: config.recurrence,
    prismType: config.prismType,
    prismRecordId: config.recordKey,
  }, calendarId);

  if (!created?.id) return undefined;

  return {
    eventId: created.id,
    lastSyncedAt: new Date().toISOString(),
  } satisfies ManagedRecurringSeriesState;
}

async function processSeriesSync(
  userId: string,
  calendarId: string,
  gcalEvents: GoogleEventLike[],
  timezone: string,
  updates: string[],
  currentSeries: ManagedRecurringSeriesState | undefined,
  config: SeriesConfig | null,
  onSync: ((series: ManagedRecurringSeriesState) => Promise<void>) | null,
  message: string,
  orphanLookup?: OrphanLookup,
): Promise<ManagedRecurringSeriesState | undefined> {
  const nextSeries = await upsertRecurringSeries(userId, calendarId, currentSeries, config, orphanLookup);
  if (!config || !nextSeries?.eventId) return undefined;

  const matchingEvents = gcalEvents.filter((e) => e.recurringEventId === nextSeries.eventId);
  const synced = syncSeriesExceptions(nextSeries, matchingEvents, config.defaultsByDate, timezone);
  if (!synced) return undefined;

  if (onSync) await onSync(synced);
  updates.push(message);
  return synced;
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
        recordKey: 'series-review-WEEKLY',
        title: 'Weekly Review',
        description: `Start your Weekly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
        prismType: 'review',
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
        recordKey: 'series-review-MONTHLY',
        title: 'Monthly Review',
        description: `Start your Monthly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
        prismType: 'review',
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
        recordKey: 'series-review-YEARLY',
        title: 'Yearly Review',
        description: `Start your Yearly Review in Prism: ${baseUrl}/reviews`,
        start: first.start,
        end: first.end,
        timeZone: timezone,
        recurrence,
        defaultsByDate,
        prismType: 'review',
      };
    }
  }

  return configs;
}

function buildPowerdownSeriesConfig(user: any, timezone: string, rangeStart: Date, rangeEnd: Date, baseUrl: string): SeriesConfig | null {
  if (!user.powerdownTime) return null;
  const firstDateKey = getDateKey(rangeStart, timezone);
  const firstWindow = buildTimedWindow(firstDateKey, user.powerdownTime, 30, timezone);
  const defaultsByDate = new Map<string, { start: string; end: string }>();

  forEachDayInRange(rangeStart, rangeEnd, timezone, (dateKey) => {
    defaultsByDate.set(dateKey, buildTimedWindow(dateKey, user.powerdownTime, 30, timezone));
  });

  return {
    key: 'powerdown',
    recordKey: 'series-powerdown',
    title: 'Power Down Ritual',
    description: `Start your Power Down Ritual in Prism: ${baseUrl}/powerdown`,
    start: firstWindow.start,
    end: firstWindow.end,
    timeZone: timezone,
    recurrence: buildPowerdownRecurrence(),
    defaultsByDate,
    prismType: 'powerdown',
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
    recordKey: `series-process-${process.id}`,
    title: process.title,
    description: `Recurring process in Prism: ${process.title}`,
    start: first.start,
    end: first.end,
    timeZone: timezone,
    recurrence,
    defaultsByDate,
    prismType: 'process',
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, syncCalendarSchema);
  if ('error' in parsed) return parsed.error;
  const { start, end, force } = parsed.data;

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

  // Track delete failures across the force block so the response can warn the
  // user. Empty for non-force runs.
  const failedDeletions: string[] = [];

  // Structured record of every event deleted by the end-of-handler sweep.
  // Returned in the response so a developer or operator can confirm exactly
  // what was cleaned up from a network-tab read. `reason` lets the reader
  // tell apart cross-calendar orphans from same-recordId duplicates from
  // legacy-title (force-only) cleanups.
  type SweepReason =
    | 'orphan-tagged'         // Prism-tagged event on the target calendar that wasn't in the known-good set
    | 'orphan-non-target'     // Prism-tagged event on a non-target calendar (always an orphan by construction)
    | 'duplicate-record-id'   // tagged event sharing a `prismRecordId` with the canonical pick
    | 'legacy-title'          // pre-tag-era event matched by title under `force=true`
    | 'untagged-prism-desc';  // untagged master with Prism's exact title + description prefix (force-only)
  const swept: Array<{
    id: string;
    summary: string | null;
    sourceCalendarId: string;
    reason: SweepReason;
  }> = [];

  // Force resync: clear all sync state and let the end-of-handler sweep
  // (Pass A across ALL selected calendars) delete the actual Google events.
  //
  // We deliberately do NOT issue targeted deletes here using stale state.
  // Why: when `syncTargetCalendarId` has been switched at some point in the
  // past, `oldState.*.eventId` references events that live on the previous
  // target — not on the current `targetCalendarId`. A targeted delete to the
  // current target would 404 (treated as success by `safeDeleteGoogleEvent`),
  // state would be wiped, and the old events would survive untouched. The
  // cross-calendar sweep at the end of this handler finds and deletes them
  // correctly by their `_sourceCalendarId`.
  if (force) {
    // Clear all sync state and legacy calendarEventIds in parallel.
    // Tasks and AimInstances are now cleared too (scoped to the sync window) so
    // their orphan Google events get deleted by the sweep at the end and a fresh
    // tagged event is created in the push phase below.
    await Promise.all([
      prisma.user.update({
        where: { id: auth.userId },
        data: { googleSyncState: {} },
      }),
      prisma.review.updateMany({
        where: { userId: auth.userId, calendarEventId: { not: null } },
        data: { calendarEventId: null },
      }),
      prisma.powerdownSession.updateMany({
        where: { userId: auth.userId, calendarEventId: { not: null } },
        data: { calendarEventId: null },
      }),
      prisma.task.updateMany({
        where: {
          OR: [{ assigneeId: auth.userId }, { ownerId: auth.userId, assigneeId: null }],
          calendarEventId: { not: null },
          timeBlockStart: { gte: rangeStart, lte: rangeEnd },
        },
        data: { calendarEventId: null },
      }),
      prisma.aimInstance.updateMany({
        where: {
          userId: auth.userId,
          calendarEventId: { not: null },
          timeBlockStart: { gte: rangeStart, lte: rangeEnd },
        },
        data: { calendarEventId: null },
      }),
    ]);

    // Re-fetch user to get cleared state
    user.googleSyncState = {};
  }

  // Widen the inventory beyond `selectedCalendarIds` to every calendar the user
  // has writer/owner access to. Catches Prism-tagged orphans on calendars the
  // user has since hidden from `selectedCalendarIds` but Prism wrote to under
  // an older sync target — those are invisible to a `calendarIds`-only scan
  // and therefore survive every sweep, including Force Resync.
  const writableCalendarIds = await listWritableCalendarIds(auth.userId);
  const sweepCalendarIds = Array.from(new Set([...calendarIds, ...writableCalendarIds]));

  const [gcalEvents, allTaggedMasters, tasks, aimInstances, processes, reviews, powerdownSessions] = await Promise.all([
    listGoogleEvents(auth.userId, start, end, calendarIds, { showDeleted: true }),
    // Window-independent inventory of Prism-tagged masters and one-offs across
    // every writable calendar — wider than `calendarIds` so the sweep catches
    // orphans on calendars the user has since deselected from display. Used to
    // dedupe before insert (so we attach to a surviving master whose instances
    // may fall outside [start,end]) and to drive the orphan sweep at end-of-
    // handler. The `prismManaged='1'` tag is what makes the cross-calendar
    // delete safe: Prism is the only writer of that tag, so any tagged event
    // on a non-selected calendar is, by construction, an orphan.
    listAllTaggedPrismMasters(auth.userId, sweepCalendarIds),
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
  // Map of prismRecordId → canonical master/one-off Google event.
  // Used to dedupe before inserting: if a prior sync created a tagged event
  // but the local row lost track of its eventId (or `googleSyncState` was
  // wiped by force-resync), we attach to the existing event instead of
  // creating a duplicate. Sourced from `allTaggedMasters` (singleEvents=false)
  // so masters whose instances fall outside [start,end] are still found.
  //
  // Canonical selection: prefer events on the target calendar (where Prism
  // writes today). Non-target events with the same recordId are by definition
  // orphans from a previous sync target — they get queued into
  // `duplicateMasterIdsToDelete` and the sweep at end-of-handler deletes them.
  // When multiple events for the same recordId live on the target calendar
  // (silent-double-write race), the first wins as canonical; the rest are
  // queued for deletion. This is what gets the user back to "exactly one
  // event per Prism record".
  type GoogleEventTagged = GoogleEventLike & {
    _sourceCalendarId?: string;
    extendedProperties?: { private?: Record<string, string> | null } | null;
  };
  const byPrismRecordId = new Map<string, GoogleEventTagged>();
  // Tagged masters with a `prismRecordId` collision against the canonical pick
  // above. These are unioned into the orphan sweep candidate set so they get
  // deleted regardless of whether their id ended up in the known-good set
  // (which can happen if a stale `calendarEventId` on a Prism row points at
  // the loser).
  const duplicateMasterIdsToDelete = new Set<string>();
  for (const event of allTaggedMasters as unknown as GoogleEventTagged[]) {
    const recordId = event.extendedProperties?.private?.prismRecordId;
    if (!recordId || !event.id) continue;
    const current = byPrismRecordId.get(recordId);
    if (!current) {
      byPrismRecordId.set(recordId, event);
      continue;
    }
    // We already have a canonical pick. Decide whether to swap based on
    // calendar residency: a target-calendar event always wins over a
    // non-target event. Otherwise the existing canonical stays.
    const currentOnTarget = current._sourceCalendarId === targetCalendarId;
    const incomingOnTarget = event._sourceCalendarId === targetCalendarId;
    if (!currentOnTarget && incomingOnTarget) {
      // Swap: demote the previous canonical to a duplicate.
      if (current.id) duplicateMasterIdsToDelete.add(current.id);
      byPrismRecordId.set(recordId, event);
    } else {
      duplicateMasterIdsToDelete.add(event.id);
    }
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

    if (hasTimeDrifted(eventStart, eventEnd, task.timeBlockStart.toISOString(), task.timeBlockEnd.toISOString(), `task ${task.title}`)) {
      // dueDate is a date-only field anchored to UTC midnight at the user's
      // local calendar date (PR #27). Use getDateKey in the user's tz to pick
      // the day, then parseDateOnly to anchor it — otherwise a 9pm-EST event
      // (04:00:00Z next day) would land in the wrong calendar bucket.
      const userDateKey = getDateKey(new Date(eventStart), timezone);
      const utcAnchoredDueDate = parseDateOnly(userDateKey) ?? new Date(eventStart);
      await prisma.task.update({
        where: { id: task.id },
        data: {
          timeBlockStart: new Date(eventStart),
          timeBlockEnd: new Date(eventEnd),
          dueDate: utcAnchoredDueDate,
        },
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

    if (hasTimeDrifted(eventStart, eventEnd, aim.timeBlockStart.toISOString(), aim.timeBlockEnd.toISOString(), `aim ${aimTitle}`)) {
      await prisma.aimInstance.update({
        where: { id: aim.id },
        data: { timeBlockStart: new Date(eventStart), timeBlockEnd: new Date(eventEnd) },
      });
      updates.push(`Pulled aim move from Google: ${aimTitle}`);
    }
  }

  // Push one-off unsynced tasks. Dedupes against `byPrismRecordId` first so
  // a prior sync's orphan event is reused instead of creating a duplicate.
  // Parallelized — each task is independent.
  const unsyncedTasks = tasks.filter((item) => !item.calendarEventId && item.timeBlockStart && item.timeBlockEnd);
  const taskPushUpdates = await Promise.all(unsyncedTasks.map(async (task) => {
    const completionUrl = getCompletionUrl(task.id, auth.userId);
    const description = task.description
      ? `${task.description}\n\nMark complete in Prism: ${completionUrl}`
      : `Mark complete in Prism: ${completionUrl}`;

    const existing = byPrismRecordId.get(task.id);
    if (existing?.id) {
      const updated = await updateGoogleEvent(auth.userId, existing.id, {
        summary: task.title,
        description,
        start: task.timeBlockStart!.toISOString(),
        end: task.timeBlockEnd!.toISOString(),
        timeZone: timezone,
      }, targetCalendarId);
      // Null = event was deleted between our list and our patch. Fall through
      // to create so the task ends up with a live event id.
      if (updated?.id) {
        await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: updated.id } });
        return `Reattached task to existing Google event: ${task.title}`;
      }
    }

    const event = await createGoogleEvent(auth.userId, {
      summary: task.title,
      description,
      start: task.timeBlockStart!.toISOString(),
      end: task.timeBlockEnd!.toISOString(),
      prismType: 'task',
      prismRecordId: task.id,
    }, targetCalendarId);

    if (event?.id) {
      await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: event.id } });
      return `Pushed task to Google: ${task.title}`;
    }
    return null;
  }));
  for (const u of taskPushUpdates) if (u) updates.push(u);

  // Push one-off unsynced aims. Same shape as tasks above.
  const unsyncedAims = aimInstances.filter((item) => !item.calendarEventId && item.timeBlockStart && item.timeBlockEnd);
  const aimPushUpdates = await Promise.all(unsyncedAims.map(async (aim) => {
    const title = aim.selectedActivity ? `${aim.aimCategory.name}: ${aim.selectedActivity}` : aim.aimCategory.name;
    const completionUrl = getAimCompletionUrl(aim.id, auth.userId);

    const existing = byPrismRecordId.get(aim.id);
    if (existing?.id) {
      const updated = await updateGoogleEvent(auth.userId, existing.id, {
        summary: title,
        description: `Mark complete in Prism: ${completionUrl}`,
        start: aim.timeBlockStart!.toISOString(),
        end: aim.timeBlockEnd!.toISOString(),
        timeZone: timezone,
      }, targetCalendarId);
      if (updated?.id) {
        await prisma.aimInstance.update({ where: { id: aim.id }, data: { calendarEventId: updated.id } });
        return `Reattached aim to existing Google event: ${title}`;
      }
    }

    const event = await createGoogleEvent(auth.userId, {
      summary: title,
      description: `Mark complete in Prism: ${completionUrl}`,
      start: aim.timeBlockStart!.toISOString(),
      end: aim.timeBlockEnd!.toISOString(),
      prismType: 'aim',
      prismRecordId: aim.id,
    }, targetCalendarId);

    if (event?.id) {
      await prisma.aimInstance.update({ where: { id: aim.id }, data: { calendarEventId: event.id } });
      return `Pushed aim to Google: ${title}`;
    }
    return null;
  }));
  for (const u of aimPushUpdates) if (u) updates.push(u);

  // Remove legacy one-off review events now that reviews are managed as recurring series.
  const activeRecurringReviewTypes = new Set<('WEEKLY' | 'MONTHLY' | 'YEARLY')>();
  if (user.weeklyReviewDayOfWeek != null && user.weeklyReviewTime) activeRecurringReviewTypes.add('WEEKLY');
  if (user.monthlyReviewRecurrenceRule && user.monthlyReviewTime) activeRecurringReviewTypes.add('MONTHLY');
  if (user.yearlyReviewRecurrenceRule && user.yearlyReviewTime) activeRecurringReviewTypes.add('YEARLY');

  for (const review of reviews) {
    if (!review.calendarEventId) continue;
    if (!activeRecurringReviewTypes.has(review.reviewType)) continue;
    const r = await safeDeleteGoogleEvent(auth.userId, review.calendarEventId, targetCalendarId);
    if (!r.ok) failedDeletions.push(r.eventId);
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
      const r = await safeDeleteGoogleEvent(auth.userId, session.calendarEventId, targetCalendarId);
      if (!r.ok) failedDeletions.push(r.eventId);
      await prisma.powerdownSession.update({
        where: { id: session.id },
        data: { calendarEventId: null },
      });
      updates.push('Removed legacy powerdown event');
    }
  }

  const orphanLookup: OrphanLookup = (recordKey) => byPrismRecordId.get(recordKey);

  // Recurring review series.
  const reviewConfigs = buildReviewSeriesConfigs(user, timezone, rangeStart, rangeEnd, baseUrl);
  googleSyncState.recurringReviews = googleSyncState.recurringReviews ?? {};

  for (const reviewType of ['WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
    try {
      const synced = await processSeriesSync(
        auth.userId, targetCalendarId, gcalEvents as GoogleEventLike[], timezone, updates,
        googleSyncState.recurringReviews[reviewType],
        reviewConfigs[reviewType] ?? null,
        (series) => applyReviewOverridesToPrism(auth.userId, reviewType, series, timezone, updates),
        `Synced ${reviewType.toLowerCase()} review series`,
        orphanLookup,
      );
      if (synced) googleSyncState.recurringReviews[reviewType] = synced;
      else delete googleSyncState.recurringReviews[reviewType];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[calendar] Failed to sync ${reviewType} review series for user ${auth.userId}:`, err);
      updates.push(`Failed to sync ${reviewType.toLowerCase()} review series: ${msg}`);
    }
  }

  // Recurring powerdown series.
  try {
    const powerdownConfig = buildPowerdownSeriesConfig(user, timezone, rangeStart, rangeEnd, baseUrl);
    const synced = await processSeriesSync(
      auth.userId, targetCalendarId, gcalEvents as GoogleEventLike[], timezone, updates,
      googleSyncState.powerdown,
      powerdownConfig,
      (series) => applyPowerdownOverridesToPrism(auth.userId, series, timezone, updates),
      'Synced powerdown series',
      orphanLookup,
    );
    if (synced) googleSyncState.powerdown = synced;
    else delete googleSyncState.powerdown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[calendar] Failed to sync powerdown series for user ${auth.userId}:`, err);
    updates.push(`Failed to sync powerdown series: ${msg}`);
  }

  // Recurring process series.
  googleSyncState.processes = googleSyncState.processes ?? {};
  const liveProcessIds = new Set<string>();

  await Promise.all(processes.map(async (process) => {
    try {
      liveProcessIds.add(process.id);
      const synced = await processSeriesSync(
        auth.userId, targetCalendarId, gcalEvents as GoogleEventLike[], timezone, updates,
        googleSyncState.processes![process.id],
        buildProcessSeriesConfig(process, timezone, rangeStart, rangeEnd),
        (series) => applyProcessOverridesToPrism(auth.userId, process.id, series, timezone, updates),
        `Synced process series: ${process.title}`,
        orphanLookup,
      );
      if (synced) googleSyncState.processes![process.id] = synced;
      else delete googleSyncState.processes![process.id];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[calendar] Failed to sync process series "${process.title}" for user ${auth.userId}:`, err);
      updates.push(`Failed to sync process series "${process.title}": ${msg}`);
    }
  }));

  for (const staleProcessId of Object.keys(googleSyncState.processes)) {
    if (liveProcessIds.has(staleProcessId)) continue;
    const stale = googleSyncState.processes[staleProcessId];
    if (stale?.eventId) {
      const r = await safeDeleteGoogleEvent(auth.userId, stale.eventId, targetCalendarId);
      if (!r.ok) failedDeletions.push(r.eventId);
    }
    delete googleSyncState.processes[staleProcessId];
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { googleSyncState: googleSyncState as Prisma.InputJsonValue },
  });

  // Sweep ALL selected calendars (not just the sync target) for any Prism-owned
  // events not in the freshly-written known-good set, and delete them. Catches
  // orphans from prior silent delete failures, one-off tasks/aims whose IDs
  // were cleared, AND events stranded on a previous sync target after a
  // `syncTargetCalendarId` switch.
  //
  // Pass A (tag-only) runs on EVERY sync — it's gated by `prismManaged=1`
  // so it cannot touch user-authored events. The tag is written exclusively
  // by Prism's own `createGoogleEvent` and is safe across calendars: every
  // tagged event on a non-target calendar is, by construction, an orphan.
  //
  // Pass B (legacy untagged title match) only runs on `force=true`. It
  // catches pre-tag-era events but is unsafe to run unconditionally:
  // a user-created event titled "Weekly Review" or matching a current
  // process title would be deleted on every sync. Force gives the user
  // an explicit opt-in. The `isSelf` filter prevents deletion of events
  // the user was merely invited to.
  type GoogleEventWithMeta = GoogleEventLike & {
    _sourceCalendarId?: string;
    creator?: { self?: boolean | null } | null;
    organizer?: { self?: boolean | null } | null;
    extendedProperties?: { private?: Record<string, string> | null } | null;
  };

  {
    // Build the known-good set from freshly-written sync state + Prism record IDs.
    const known = new Set<string>();
    for (const s of Object.values(googleSyncState.recurringReviews ?? {})) {
      if (s?.eventId) known.add(s.eventId);
    }
    if (googleSyncState.powerdown?.eventId) known.add(googleSyncState.powerdown.eventId);
    for (const s of Object.values(googleSyncState.processes ?? {})) {
      if (s?.eventId) known.add(s.eventId);
    }

    const [taskRows, aimRows, revRows, mtgRows] = await Promise.all([
      prisma.task.findMany({
        where: {
          OR: [{ assigneeId: auth.userId }, { ownerId: auth.userId, assigneeId: null }],
          calendarEventId: { not: null },
        },
        select: { calendarEventId: true },
      }),
      prisma.aimInstance.findMany({
        where: { userId: auth.userId, calendarEventId: { not: null } },
        select: { calendarEventId: true },
      }),
      prisma.review.findMany({
        where: { userId: auth.userId, calendarEventId: { not: null } },
        select: { calendarEventId: true },
      }),
      prisma.meeting.findMany({
        where: { createdById: auth.userId, calendarEventId: { not: null } },
        select: { calendarEventId: true },
      }),
    ]);
    for (const r of [...taskRows, ...aimRows, ...revRows, ...mtgRows]) {
      if (r.calendarEventId) known.add(r.calendarEventId);
    }

    // Pass A: tagged masters and one-offs across ALL selected calendars
    // (sourced from `allTaggedMasters`, which uses singleEvents=false).
    // Deleting by id removes the entire recurring series — the previous
    // instance-based sweep could only cancel individual instances, so
    // duplicate masters survived every resync. `allTaggedMasters` already
    // excludes modified-instance overrides and cancelled items.
    //
    // Per-event delete routes through `e._sourceCalendarId` (set by
    // `listAllTaggedPrismMasters`) so non-target deletes go to the right
    // calendar.
    const candidates = new Map<string, GoogleEventWithMeta>();
    for (const e of allTaggedMasters as unknown as GoogleEventWithMeta[]) {
      if (!e.id) continue;
      candidates.set(e.id, e);
    }

    // Same-recordId duplicates picked up during the canonical-selection scan
    // above. Adding them here ensures they're swept even if `known` happens
    // to contain their id (e.g., a stale `calendarEventId` on a Prism row
    // pointed at the loser before this sync).
    const forceDeleteIds = new Set<string>(duplicateMasterIdsToDelete);

    if (force) {
      // Pass B (legacy fallback, force-only): events without a Prism tag
      // matching titles Prism is known to manage. Includes the user's actual
      // process titles, so it would delete a colliding user-authored event —
      // that's why this is force-only.
      //
      // `isSelf` (creator AND organizer) prevents deletion of events the user
      // was invited to. Spans all selected calendars so legacy duplicates on
      // a previous sync target are caught.
      const legacyTitles = new Set<string>([
        'Weekly Review', 'Monthly Review', 'Yearly Review', 'Power Down Ritual',
        ...processes.map((p) => p.title),
      ]);
      for (const e of gcalEvents as GoogleEventWithMeta[]) {
        if (!e.id || !e.summary) continue;
        if (e.extendedProperties?.private?.prismManaged === '1') continue;
        const isSelf = e.creator?.self === true && e.organizer?.self === true;
        if (isSelf && legacyTitles.has(e.summary)) candidates.set(e.id, e);
      }

      // Pass C (untagged-Prism-description, force-only): masters with one of
      // Prism's hardcoded recurring titles AND Prism's exact description
      // prefix ("Start your … in Prism:"), but no `prismManaged='1'` tag.
      //
      // Pass B can't catch these because:
      //   1. `gcalEvents` is `singleEvents: true`, so it expands recurring
      //      series into instances; deleting an instance only cancels one
      //      occurrence, leaving the master + all future instances alive.
      //   2. `creator.self` is `undefined` (not `true`) when the user owns
      //      the host group-calendar but Google records the creator email
      //      against the underlying account — so `isSelf` silently rejects
      //      every untagged orphan on the user's "Prism Events" calendar.
      //
      // Pass C fetches MASTERS (`singleEvents: false`) across every writable
      // calendar and gates deletion on the description prefix, which Prism
      // is the only known writer of. Safer than title-only matching, and
      // catches the recurring-master case that Pass B misses.
      const untaggedLookalikes = await listUntaggedPrismLookalikes(
        auth.userId,
        sweepCalendarIds,
        ['Weekly Review', 'Monthly Review', 'Yearly Review', 'Power Down Ritual'],
      );
      for (const e of untaggedLookalikes as unknown as GoogleEventWithMeta[]) {
        if (!e.id) continue;
        candidates.set(e.id, e);
        // Force the deletion past the `known.has(e.id)` short-circuit below
        // so a stale `googleSyncState.*.eventId` still pointing at one of
        // these orphans (e.g. when the upsert path returned `current` on
        // transient error) cannot accidentally protect it.
        forceDeleteIds.add(e.id);
      }
    }

    const sweepResults = await Promise.all(
      Array.from(candidates.values()).map(async (e) => {
        if (!e.id || e.status === 'cancelled') return { skipped: true } as const;
        // Explicit duplicate (same prismRecordId as a canonical pick) — delete
        // even if its id sneaked into `known` via a stale `calendarEventId`.
        const forceDelete = forceDeleteIds.has(e.id);
        if (!forceDelete) {
          if (known.has(e.id)) return { skipped: true } as const;
          if (e.recurringEventId && known.has(e.recurringEventId)) return { skipped: true } as const;
        }
        const sourceCal = e._sourceCalendarId ?? targetCalendarId;
        // Tag the reason so the response's `swept[]` tells the developer
        // why each event was deleted. `forceDelete` covers both same-recordId
        // duplicates (tagged) and Pass C lookalikes (untagged) — split them
        // by tag presence so the reason line stays diagnostic.
        const tagged = e.extendedProperties?.private?.prismManaged === '1';
        const reason: SweepReason = forceDelete
          ? (tagged ? 'duplicate-record-id' : 'untagged-prism-desc')
          : tagged
            ? (sourceCal === targetCalendarId ? 'orphan-tagged' : 'orphan-non-target')
            : 'legacy-title';
        const r = await safeDeleteGoogleEvent(auth.userId, e.id, sourceCal);
        return { skipped: false, result: r, summary: e.summary, id: e.id, sourceCal, reason } as const;
      }),
    );
    for (const sr of sweepResults) {
      if (sr.skipped) continue;
      if (!sr.result.ok) {
        failedDeletions.push(sr.result.eventId);
        continue;
      }
      updates.push(`Cleaned up orphan event: ${sr.summary ?? sr.id}`);
      swept.push({
        id: sr.id,
        summary: sr.summary ?? null,
        sourceCalendarId: sr.sourceCal,
        reason: sr.reason,
      });
    }
  }

  if (failedDeletions.length > 0) {
    updates.push(`Could not delete ${failedDeletions.length} event(s); retry resync to clean up.`);
  }

  return Response.json({
    synced: true,
    updates,
    failedDeletions,
    swept,
    googleEventCount: gcalEvents.length,
    oneOffTasksChecked: tasks.length,
    oneOffAimsChecked: aimInstances.length,
    recurringReviewSeries: Object.keys(googleSyncState.recurringReviews ?? {}).length,
    recurringProcessSeries: Object.keys(googleSyncState.processes ?? {}).length,
  });
}
