import { Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { getCalendarClient } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import {
  cloneGoogleSyncState,
  parseGoogleSyncState,
  getDateKey,
  type GoogleSyncState,
  type ManagedRecurringSeriesState,
} from '@/lib/google-sync-state';

function buildDateRange(dateKey: string, timezone: string) {
  const dayStart = fromZonedTime(`${dateKey}T00:00:00`, timezone);
  const dayEnd = fromZonedTime(`${dateKey}T23:59:59`, timezone);
  return { dayStart, dayEnd };
}

async function findRecurringInstanceId(
  userId: string,
  calendarId: string,
  masterEventId: string,
  dateKey: string,
  timezone: string,
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  const { dayStart, dayEnd } = buildDateRange(dateKey, timezone);
  const response = await calendar.events.instances({
    calendarId,
    eventId: masterEventId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    showDeleted: true,
    maxResults: 10,
  });

  const instance = (response.data.items ?? []).find((item) => {
    const original = item.originalStartTime?.dateTime ?? item.originalStartTime?.date;
    if (!original) return false;
    return getDateKey(new Date(original), timezone) === dateKey;
  });

  return instance?.id ?? null;
}

type StateSelector = (state: GoogleSyncState) => ManagedRecurringSeriesState | undefined;
type StateWriter = (state: GoogleSyncState, series: ManagedRecurringSeriesState | undefined) => void;

async function withManagedSeriesState(
  userId: string,
  selector: StateSelector,
  writer: StateWriter,
  mutate: (
    series: ManagedRecurringSeriesState,
    ctx: { calendarId: string; timezone: string; dateKey: string },
  ) => Promise<ManagedRecurringSeriesState | undefined>,
  date: Date,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleSyncState: true, syncTargetCalendarId: true, timezone: true, googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken) return;

  const timezone = user.timezone ?? 'America/New_York';
  const calendarId = user.syncTargetCalendarId || 'primary';
  const state = cloneGoogleSyncState(parseGoogleSyncState(user.googleSyncState));
  const current = selector(state);
  if (!current?.eventId) return;

  const dateKey = getDateKey(date, timezone);
  const nextSeries = await mutate(current, { calendarId, timezone, dateKey });
  writer(state, nextSeries);

  await prisma.user.update({
    where: { id: userId },
    data: { googleSyncState: state as Prisma.InputJsonValue },
  });
}

export async function syncManagedSeriesOverride(options: {
  userId: string;
  date: Date;
  start: Date;
  end: Date;
  selector: StateSelector;
  writer: StateWriter;
}) {
  await withManagedSeriesState(
    options.userId,
    options.selector,
    options.writer,
    async (series, { calendarId, timezone, dateKey }) => {
      const calendar = await getCalendarClient(options.userId);
      if (!calendar) return series;

      const existingOverride = series.overrides?.[dateKey];
      const instanceId = existingOverride?.googleEventId
        ?? await findRecurringInstanceId(options.userId, calendarId, series.eventId, dateKey, timezone);

      if (!instanceId) return series;

      const response = await calendar.events.patch({
        calendarId,
        eventId: instanceId,
        requestBody: {
          start: { dateTime: options.start.toISOString(), timeZone: timezone },
          end: { dateTime: options.end.toISOString(), timeZone: timezone },
        },
      });

      return {
        ...series,
        overrides: {
          ...(series.overrides ?? {}),
          [dateKey]: {
            googleEventId: response.data.id ?? instanceId,
            start: options.start.toISOString(),
            end: options.end.toISOString(),
          },
        },
        cancelledDates: (series.cancelledDates ?? []).filter((item) => item !== dateKey),
        lastSyncedAt: new Date().toISOString(),
      };
    },
    options.date,
  );
}

export async function cancelManagedSeriesInstance(options: {
  userId: string;
  date: Date;
  selector: StateSelector;
  writer: StateWriter;
}) {
  await withManagedSeriesState(
    options.userId,
    options.selector,
    options.writer,
    async (series, { calendarId, timezone, dateKey }) => {
      const calendar = await getCalendarClient(options.userId);
      if (!calendar) return series;

      const existingOverride = series.overrides?.[dateKey];
      const instanceId = existingOverride?.googleEventId
        ?? await findRecurringInstanceId(options.userId, calendarId, series.eventId, dateKey, timezone);

      if (!instanceId) return series;

      await calendar.events.patch({
        calendarId,
        eventId: instanceId,
        requestBody: { status: 'cancelled' },
      });

      const nextOverrides = { ...(series.overrides ?? {}) };
      delete nextOverrides[dateKey];

      return {
        ...series,
        overrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
        cancelledDates: Array.from(new Set([...(series.cancelledDates ?? []), dateKey])).sort(),
        lastSyncedAt: new Date().toISOString(),
      };
    },
    options.date,
  );
}
