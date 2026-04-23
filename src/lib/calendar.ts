import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { decryptToken } from './crypto';
import { getCompletionUrl } from './completion-token';

type GoogleApiErrorShape = {
  code?: number;
  status?: number;
  message?: string;
  response?: { status?: number; headers?: Record<string, string | string[] | undefined> };
};

function extractStatus(err: unknown): number | undefined {
  const e = err as GoogleApiErrorShape;
  return e?.code ?? e?.status ?? e?.response?.status;
}

export type GoogleErrorCode =
  | 'not_connected'
  | 'not_found'
  | 'rate_limited'
  | 'precondition_failed'
  | 'transient'
  | 'auth'
  | 'unknown';

export interface GoogleErrorInfo {
  code: GoogleErrorCode;
  retryable: boolean;
  message: string;
  status?: number;
}

/**
 * Map an error thrown by the googleapis client to a stable code + flags the
 * caller can act on. Callers use this to log structured telemetry, surface
 * the right UX (reconnect banner vs. retry toast), or decide retry strategy.
 */
export function classifyGoogleError(err: unknown): GoogleErrorInfo {
  const status = extractStatus(err);
  const message = (err as GoogleApiErrorShape)?.message ?? (err instanceof Error ? err.message : String(err));

  if (status === 401 || status === 403) return { code: 'auth', retryable: false, message, status };
  if (status === 404 || status === 410) return { code: 'not_found', retryable: false, message, status };
  if (status === 412) return { code: 'precondition_failed', retryable: true, message, status };
  if (status === 429) return { code: 'rate_limited', retryable: true, message, status };
  if (status !== undefined && status >= 500 && status < 600) return { code: 'transient', retryable: true, message, status };
  if (status !== undefined) return { code: 'unknown', retryable: false, message, status };
  // Network / no HTTP status — treat as transient so the caller can retry.
  return { code: 'transient', retryable: true, message };
}

function extractRetryAfterMs(err: unknown): number | undefined {
  const headerVal = (err as GoogleApiErrorShape)?.response?.headers?.['retry-after'];
  const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * Retry a Google API call on 429 / 5xx with exponential backoff and jitter.
 * Honors Retry-After when Google provides it. Up to 5 attempts total.
 */
export async function withBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [250, 500, 1250, 3000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = extractStatus(err);
      const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
      if (!retryable || attempt === delays.length) throw err;
      const retryAfter = extractRetryAfterMs(err);
      const base = delays[attempt];
      const wait = retryAfter ?? Math.round(base * (1 + Math.random() * 0.25));
      console.info(`[calendar] retry ${label} after ${wait}ms (status=${status}, attempt=${attempt + 1})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  // unreachable — the loop either returns or throws
  throw new Error(`withBackoff exhausted for ${label}`);
}

/**
 * Single query to get Google sync info for a user.
 * Returns whether they have a linked Google account and their target calendar ID.
 */
export async function getGoogleSyncInfo(userId: string): Promise<{ hasGoogle: boolean; calendarId: string; timezone: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleRefreshToken: true, syncTargetCalendarId: true, timezone: true },
    });
    return {
      hasGoogle: !!user?.googleRefreshToken,
      calendarId: user?.syncTargetCalendarId || 'primary',
      timezone: user?.timezone || 'UTC',
    };
  } catch (err) {
    console.warn('[calendar] getGoogleSyncInfo check failed:', err);
    return { hasGoogle: false, calendarId: 'primary', timezone: 'UTC' };
  }
}

/** @deprecated Use getGoogleSyncInfo instead */
export async function hasGoogleAccount(userId: string): Promise<boolean> {
  const { hasGoogle } = await getGoogleSyncInfo(userId);
  return hasGoogle;
}

/** @deprecated Use getGoogleSyncInfo instead */
export async function getUserSyncCalendarId(userId: string): Promise<string> {
  const { calendarId } = await getGoogleSyncInfo(userId);
  return calendarId;
}

/**
 * A start/end point for a calendar event.
 * - `string`: ISO datetime, rendered as a timed event (`dateTime`).
 * - `{ date: "YYYY-MM-DD" }`: all-day event. Google treats `end.date` as exclusive,
 *   so a single-day event on 2026-04-19 needs `end.date = "2026-04-20"`.
 */
export type EventTimePoint = string | { date: string };

function buildTimePoint(
  point: EventTimePoint,
  timeZone?: string,
): Record<string, string> {
  if (typeof point === 'string') {
    const obj: Record<string, string> = { dateTime: point };
    if (timeZone) obj.timeZone = timeZone;
    return obj;
  }
  return { date: point.date };
}

function toDateKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const d = value instanceof Date ? value : new Date(value);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build start/end EventTimePoints for an event from a scheduled date and optional time blocks.
 * - Both time blocks set → timed event (ISO datetime).
 * - Otherwise → all-day event spanning the scheduled date (end is exclusive per Google).
 */
export function buildEventTimes(params: {
  scheduledDate: Date | string;
  timeBlockStart?: Date | string | null;
  timeBlockEnd?: Date | string | null;
}): { start: EventTimePoint; end: EventTimePoint } {
  if (params.timeBlockStart && params.timeBlockEnd) {
    return {
      start: new Date(params.timeBlockStart).toISOString(),
      end: new Date(params.timeBlockEnd).toISOString(),
    };
  }
  const startKey = toDateKey(params.scheduledDate);
  const endKey = addDaysToDateKey(startKey, 1);
  return {
    start: { date: startKey },
    end: { date: endKey },
  };
}

/**
 * Fetch a single Google Calendar event. Used to read the current `etag`
 * before a conditional update (If-Match) and to re-fetch after a 412
 * precondition-failed to merge remote changes.
 */
export async function getGoogleEvent(
  userId: string,
  eventId: string,
  calendarId: string = 'primary',
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const response = await withBackoff(
      () => calendar.events.get({ calendarId, eventId }),
      `events.get ${calendarId}/${eventId}`,
    );
    return response.data;
  } catch (err) {
    const info = classifyGoogleError(err);
    if (info.code === 'not_found') return null;
    throw err;
  }
}

/**
 * Update an existing Google Calendar event.
 *
 * When `opts.ifMatch` is supplied, Google will reject the update with 412
 * Precondition Failed if the event has been modified since the caller read
 * that etag. Callers handle 412 by re-fetching, merging, and retrying once.
 */
export async function updateGoogleEvent(
  userId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start?: EventTimePoint;
    end?: EventTimePoint;
    timeZone?: string;
    recurrence?: string[];
  },
  calendarId: string = 'primary',
  opts?: { ifMatch?: string },
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const requestBody: Record<string, unknown> = {
      ...event.summary !== undefined && { summary: event.summary },
      ...event.description !== undefined && { description: event.description },
      ...event.start !== undefined && {
        start: buildTimePoint(event.start, event.timeZone),
      },
      ...event.end !== undefined && {
        end: buildTimePoint(event.end, event.timeZone),
      },
      ...event.recurrence !== undefined && { recurrence: event.recurrence },
    };

    const response = await withBackoff(
      () =>
        calendar.events.patch(
          { calendarId, eventId, requestBody },
          opts?.ifMatch ? { headers: { 'If-Match': opts.ifMatch } } : undefined,
        ),
      `events.patch ${calendarId}/${eventId}`,
    );

    return response.data;
  } catch (err) {
    const info = classifyGoogleError(err);
    console.warn(`[calendar] updateGoogleEvent failed`, { eventId, calendarId, ...info });
    if (info.code === 'not_found') {
      // Event genuinely gone — caller should create a replacement
      return null;
    }
    // Transient / auth / unknown — re-throw so caller doesn't accidentally
    // treat this as a clean delete-then-recreate cycle
    throw err;
  }
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteGoogleEvent(userId: string, eventId: string, calendarId: string = 'primary') {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return false;

  try {
    await withBackoff(
      () => calendar.events.delete({ calendarId, eventId }),
      `events.delete ${calendarId}/${eventId}`,
    );
    return true;
  } catch (err) {
    const info = classifyGoogleError(err);
    // `not_found` on delete is idempotent success — caller shouldn't error.
    if (info.code === 'not_found') return true;
    console.warn(`[calendar] deleteGoogleEvent failed`, { eventId, calendarId, ...info });
    return false;
  }
}

/**
 * Get an authenticated Google Calendar API client for a user.
 * Returns null if the user hasn't connected Google Calendar.
 */
export async function getCalendarClient(userId: string) {
  const [user, account] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { googleRefreshToken: true, googleTokenExpiresAt: true },
    }),
    prisma.account.findFirst({
      where: { userId, provider: 'google' },
      select: { id: true, access_token: true, expires_at: true },
    }),
  ]);

  if (!user?.googleRefreshToken || !account) return null;

  // Warn when the stored token expiry is within the next hour. The googleapis
  // client will transparently refresh the access token at call time, but if
  // the *refresh* token itself is aging out (Google expires unused refresh
  // tokens after ~6 months) this log gives us a signal before users start
  // hitting hard 401s on calendar writes.
  if (user.googleTokenExpiresAt) {
    const msUntilExpiry = user.googleTokenExpiresAt.getTime() - Date.now();
    if (msUntilExpiry < 60 * 60 * 1000) {
      console.warn('[calendar] token expiring', {
        userId,
        expiresAt: user.googleTokenExpiresAt.toISOString(),
        msUntilExpiry,
      });
    }
  }

  // Decrypt the token if encryption is enabled
  let refreshToken = user.googleRefreshToken;
  if (process.env.TOKEN_ENCRYPTION_KEY) {
    const decrypted = decryptToken(user.googleRefreshToken);
    if (decrypted) {
      refreshToken = decrypted;
    } else if (user.googleRefreshToken.includes(':')) {
      // Token looks encrypted (iv:authTag:ciphertext) but can't be decrypted — key rotated or corrupted
      console.error(`[calendar] Cannot decrypt refresh token for user ${userId} — re-auth required`);
      return null;
    }
    // else: no colons → genuinely a pre-migration plaintext token, use as-is
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: account.access_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Auto-refresh tokens
  oauth2Client.on('tokens', async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
      },
    });
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * List events from user's Google Calendar within a date range.
 * If calendarIds is provided, fetches from each and merges results.
 * Defaults to ['primary'] if not provided.
 * Each returned event is tagged with _sourceCalendarId.
 */
export async function listGoogleEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  calendarIds?: string[],
  options?: { showDeleted?: boolean }
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return [];

  // undefined = user never configured → default to primary
  // [] = user explicitly deselected all → return nothing
  if (calendarIds !== undefined && calendarIds.length === 0) {
    return [];
  }
  const ids = calendarIds?.length ? [...calendarIds] : ['primary'];

  const results = await Promise.all(
    ids.map(async (calendarId) => {
      try {
        const allEvents: (Record<string, unknown> & { _sourceCalendarId: string })[] = [];
        let pageToken: string | undefined;

        do {
          const response = await withBackoff(
            () =>
              calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 250,
                pageToken,
                ...(options?.showDeleted && { showDeleted: true }),
              }),
            `events.list ${calendarId}`,
          );
          const items = (response.data.items ?? []).map((ev) => ({
            ...ev,
            _sourceCalendarId: calendarId,
          }));
          allEvents.push(...items);
          pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken);

        return allEvents;
      } catch (err) {
        console.error(`[calendar] Failed to fetch events from calendar ${calendarId}:`, err);
        return [];
      }
    })
  );

  // Merge and sort by start time
  return results.flat().sort((a, b) => {
    const aStart = a.start as Record<string, unknown> | undefined;
    const bStart = b.start as Record<string, unknown> | undefined;
    const aTime = (aStart?.dateTime ?? aStart?.date ?? '') as string;
    const bTime = (bStart?.dateTime ?? bStart?.date ?? '') as string;
    return aTime.localeCompare(bTime);
  });
}

/**
 * Safely sync a task to Google Calendar: create, update, or delete event.
 * Swallows errors so callers don't need try/catch.
 * Uses the user's configured sync target calendar.
 */
export async function syncTaskCalendarEvent(
  userId: string,
  task: { id?: string; calendarEventId?: string | null; title: string; description?: string | null; timeBlockStart?: Date | string | null; timeBlockEnd?: Date | string | null },
  action: 'create' | 'update' | 'delete'
): Promise<string | null> {
  try {
    const { calendarId: targetCalendarId, timezone } = await getGoogleSyncInfo(userId);

    if (action === 'delete' && task.calendarEventId) {
      await deleteGoogleEvent(userId, task.calendarEventId, targetCalendarId);
      return null;
    }

    // Build description with completion link
    const completionLink = task.id ? `\n\nMark complete in Prism: ${getCompletionUrl(task.id, userId)}` : '';
    const fullDescription = (task.description ?? '') + completionLink;

    if (action === 'update' && task.calendarEventId) {
      await updateGoogleEvent(userId, task.calendarEventId, {
        summary: task.title,
        description: fullDescription || undefined,
        start: task.timeBlockStart ? new Date(task.timeBlockStart).toISOString() : undefined,
        end: task.timeBlockEnd ? new Date(task.timeBlockEnd).toISOString() : undefined,
        timeZone: timezone,
      }, targetCalendarId);
      return task.calendarEventId;
    }

    if (action === 'create' && task.timeBlockStart && task.timeBlockEnd) {
      const gcalEvent = await createGoogleEvent(userId, {
        summary: task.title,
        description: fullDescription || undefined,
        start: new Date(task.timeBlockStart).toISOString(),
        end: new Date(task.timeBlockEnd).toISOString(),
        timeZone: timezone,
      }, targetCalendarId);
      return gcalEvent?.id ?? null;
    }

    return task.calendarEventId ?? null;
  } catch (err) {
    const info = classifyGoogleError(err);
    console.warn(`[calendar] syncTaskCalendarEvent failed`, { userId, taskId: task.id, action, ...info });
    return task.calendarEventId ?? null;
  }
}

/**
 * Create a Google Calendar event (optionally with Meet link and/or recurrence).
 */
export async function createGoogleEvent(
  userId: string,
  event: {
    summary: string;
    description?: string;
    start: EventTimePoint;
    end: EventTimePoint;
    timeZone?: string;
    addMeetLink?: boolean;
    recurrence?: string[];
    attendees?: Array<{ email: string }>;
  },
  calendarId: string = 'primary'
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const eventBody: Record<string, unknown> = {
      summary: event.summary,
      description: event.description,
      start: buildTimePoint(event.start, event.timeZone),
      end: buildTimePoint(event.end, event.timeZone),
    };

    if (event.addMeetLink) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `meet-${randomBytes(8).toString('hex')}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    if (event.recurrence) {
      eventBody.recurrence = event.recurrence;
    }

    if (event.attendees?.length) {
      eventBody.attendees = event.attendees;
    }

    // If a non-primary target calendar was requested, verify we can still
    // write to it. If the calendar was deleted or unsubscribed, writing
    // succeeds but the event "disappears" from the user's default view.
    // Fall back to 'primary' in that case and clear the stale setting.
    let effectiveCalendarId = calendarId;
    if (calendarId !== 'primary') {
      try {
        await withBackoff(
          () => calendar.calendarList.get({ calendarId }),
          `calendarList.get ${calendarId}`,
        );
      } catch (listErr) {
        console.warn(
          `[calendar] syncTargetCalendarId "${calendarId}" is no longer accessible; falling back to primary.`,
          listErr instanceof Error ? listErr.message : listErr,
        );
        effectiveCalendarId = 'primary';
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { syncTargetCalendarId: null },
          });
        } catch {
          // best-effort cleanup; don't fail the insert
        }
      }
    }

    const response = await withBackoff(
      () =>
        calendar.events.insert({
          calendarId: effectiveCalendarId,
          requestBody: eventBody,
          conferenceDataVersion: event.addMeetLink ? 1 : 0,
          sendUpdates: 'all',
        }),
      `events.insert ${effectiveCalendarId}`,
    );

    console.info('[calendar] createGoogleEvent ok', {
      calendarIdUsed: effectiveCalendarId,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      attendeeCount: event.attendees?.length ?? 0,
    });

    return response.data;
  } catch (err) {
    const info = classifyGoogleError(err);
    console.error(`[calendar] createGoogleEvent failed`, { calendarId, summary: event.summary, ...info });
    return null;
  }
}

/**
 * Map a ProcessCadence + dayOfWeek to a Google Calendar RRULE array.
 * Returns undefined for ONE_TIME (no recurrence).
 */
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const MONTHLY_REVIEW_RULES: Record<string, string[]> = {
  'last-friday': ['RRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1'],
  'last-monday': ['RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1'],
  '1st-monday': ['RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
  '1st-friday': ['RRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=1'],
  '15th': ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'],
};

export function buildMonthlyReviewRecurrence(rule?: string | null): string[] | undefined {
  if (!rule) return undefined;
  return MONTHLY_REVIEW_RULES[rule];
}

export function buildYearlyReviewRecurrence(rule?: string | null): string[] | undefined {
  if (!rule) return undefined;
  if (rule === 'dec-30') return ['RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=30'];
  if (rule === 'dec-31') return ['RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=31'];
  if (rule === 'last-sat-dec') return ['RRULE:FREQ=YEARLY;BYMONTH=12;BYDAY=SA;BYSETPOS=-1'];

  const customMatch = /^custom:(\d{2})-(\d{2})$/.exec(rule);
  if (customMatch) {
    return [`RRULE:FREQ=YEARLY;BYMONTH=${parseInt(customMatch[1], 10)};BYMONTHDAY=${parseInt(customMatch[2], 10)}`];
  }

  return undefined;
}

export function buildWeeklyReviewRecurrence(dayOfWeek?: number | null): string[] | undefined {
  if (dayOfWeek == null) return undefined;
  return [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[dayOfWeek]}`];
}

export function buildPowerdownRecurrence(): string[] {
  return ['RRULE:FREQ=DAILY'];
}

export function buildMeetingRecurrence(
  cadence: string,
  dayOfWeek: number | null
): string[] | undefined {
  const day = dayOfWeek != null ? RRULE_DAYS[dayOfWeek] : 'MO';

  switch (cadence) {
    case 'ONE_TIME':
      return undefined;
    case 'DAILY':
      // Weekdays only (matching generateMeetingInstances behavior when dayOfWeek is null)
      return dayOfWeek == null
        ? ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']
        : ['RRULE:FREQ=DAILY'];
    case 'WEEKLY':
      return [`RRULE:FREQ=WEEKLY;BYDAY=${day}`];
    case 'BIWEEKLY':
      return [`RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`];
    case 'MONTHLY':
      return [`RRULE:FREQ=MONTHLY;BYDAY=1${day}`];
    case 'QUARTERLY':
      return [`RRULE:FREQ=MONTHLY;INTERVAL=3;BYDAY=1${day}`];
    case 'YEARLY':
      return [`RRULE:FREQ=YEARLY;BYMONTH=1;BYDAY=1${day}`];
    default:
      return undefined;
  }
}

export function buildProcessRecurrence(process: {
  cadence: string;
  scheduledDayOfWeek?: number | null;
  scheduledDayOfMonth?: number | null;
}): string[] | undefined {
  const dayOfWeek = process.scheduledDayOfWeek ?? null;
  const day = dayOfWeek != null ? RRULE_DAYS[dayOfWeek] : 'MO';

  switch (process.cadence) {
    case 'ONE_TIME':
      return undefined;
    case 'DAILY':
      return dayOfWeek == null
        ? ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']
        : ['RRULE:FREQ=DAILY'];
    case 'WEEKLY':
      return [`RRULE:FREQ=WEEKLY;BYDAY=${day}`];
    case 'BIWEEKLY':
      return [`RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`];
    case 'MONTHLY':
      return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${process.scheduledDayOfMonth ?? 1}`];
    case 'QUARTERLY':
      return [`RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${process.scheduledDayOfMonth ?? 1}`];
    case 'YEARLY':
      return ['RRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1'];
    default:
      return undefined;
  }
}
