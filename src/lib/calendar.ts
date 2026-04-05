import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { decryptToken } from './crypto';
import { getCompletionUrl } from './completion-token';

/**
 * Single query to get Google sync info for a user.
 * Returns whether they have a linked Google account and their target calendar ID.
 */
export async function getGoogleSyncInfo(userId: string): Promise<{ hasGoogle: boolean; calendarId: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleRefreshToken: true, syncTargetCalendarId: true },
    });
    return {
      hasGoogle: !!user?.googleRefreshToken,
      calendarId: user?.syncTargetCalendarId || 'primary',
    };
  } catch (err) {
    console.warn('[calendar] getGoogleSyncInfo check failed:', err);
    return { hasGoogle: false, calendarId: 'primary' };
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
 * Update an existing Google Calendar event.
 */
export async function updateGoogleEvent(
  userId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start?: string;
    end?: string;
  },
  calendarId: string = 'primary'
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const requestBody: any = {
      ...event.summary !== undefined && { summary: event.summary },
      ...event.description !== undefined && { description: event.description },
      ...event.start !== undefined && { start: { dateTime: event.start } },
      ...event.end !== undefined && { end: { dateTime: event.end } },
    };

    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
    });

    return response.data;
  } catch (err) {
    console.warn('[calendar] Failed to update Google event:', err);
    return null;
  }
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteGoogleEvent(userId: string, eventId: string, calendarId: string = 'primary') {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return false;

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    return true;
  } catch (err) {
    console.warn('[calendar] Failed to delete Google event:', err);
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
      select: { googleRefreshToken: true },
    }),
    prisma.account.findFirst({
      where: { userId, provider: 'google' },
      select: { id: true, access_token: true, expires_at: true },
    }),
  ]);

  if (!user?.googleRefreshToken || !account) return null;

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
        const allEvents: any[] = [];
        let pageToken: string | undefined;

        do {
          const response = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            pageToken,
            ...(options?.showDeleted && { showDeleted: true }),
          });
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
    const aTime = a.start?.dateTime ?? a.start?.date ?? '';
    const bTime = b.start?.dateTime ?? b.start?.date ?? '';
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
    const targetCalendarId = await getUserSyncCalendarId(userId);

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
      }, targetCalendarId);
      return task.calendarEventId;
    }

    if (action === 'create' && task.timeBlockStart && task.timeBlockEnd) {
      const gcalEvent = await createGoogleEvent(userId, {
        summary: task.title,
        description: fullDescription || undefined,
        start: new Date(task.timeBlockStart).toISOString(),
        end: new Date(task.timeBlockEnd).toISOString(),
      }, targetCalendarId);
      return gcalEvent?.id ?? null;
    }

    return task.calendarEventId ?? null;
  } catch (err) {
    console.warn('[calendar] Google Calendar sync failed:', err);
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
    start: string;
    end: string;
    timeZone?: string;
    addMeetLink?: boolean;
    recurrence?: string[];
  },
  calendarId: string = 'primary'
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const startObj: any = { dateTime: event.start };
    const endObj: any = { dateTime: event.end };
    if (event.timeZone) {
      startObj.timeZone = event.timeZone;
      endObj.timeZone = event.timeZone;
    }

    const eventBody: any = {
      summary: event.summary,
      description: event.description,
      start: startObj,
      end: endObj,
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

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
      conferenceDataVersion: event.addMeetLink ? 1 : 0,
    });

    return response.data;
  } catch (err) {
    console.error('[calendar] createGoogleEvent failed:', err);
    return null;
  }
}

/**
 * Map a ProcessCadence + dayOfWeek to a Google Calendar RRULE array.
 * Returns undefined for ONE_TIME (no recurrence).
 */
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

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
