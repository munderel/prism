import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { decryptToken } from './crypto';
import { getCompletionUrl } from './completion-token';

/**
 * Check if a user has a Google account linked (for graceful degradation).
 */
export async function hasGoogleAccount(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleRefreshToken: true },
    });
    return !!user?.googleRefreshToken;
  } catch (err) {
    console.warn('[calendar] hasGoogleAccount check failed:', err);
    return false;
  }
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
  }
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
      calendarId: 'primary',
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
export async function deleteGoogleEvent(userId: string, eventId: string) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return false;

  try {
    await calendar.events.delete({
      calendarId: 'primary',
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

  // Decrypt the token if encryption is enabled, falling back to plaintext for pre-migration tokens
  let refreshToken = user.googleRefreshToken;
  if (process.env.TOKEN_ENCRYPTION_KEY) {
    refreshToken = decryptToken(user.googleRefreshToken) ?? refreshToken;
    if (refreshToken === user.googleRefreshToken) {
      console.warn(`[calendar] Failed to decrypt refresh token for user ${userId} — using as plaintext (pre-migration token?)`);
    }
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
 */
export async function listGoogleEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  calendarIds?: string[]
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return [];

  const ids = calendarIds?.length ? calendarIds : ['primary'];

  const results = await Promise.all(
    ids.map(async (calendarId) => {
      try {
        const response = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        });
        return response.data.items ?? [];
      } catch {
        console.warn(`[calendar] Failed to fetch events from calendar ${calendarId}`);
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
 */
export async function syncTaskCalendarEvent(
  userId: string,
  task: { id?: string; calendarEventId?: string | null; title: string; description?: string | null; timeBlockStart?: Date | string | null; timeBlockEnd?: Date | string | null },
  action: 'create' | 'update' | 'delete'
): Promise<string | null> {
  try {
    if (action === 'delete' && task.calendarEventId) {
      await deleteGoogleEvent(userId, task.calendarEventId);
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
      });
      return task.calendarEventId;
    }

    if (action === 'create' && task.timeBlockStart && task.timeBlockEnd) {
      const gcalEvent = await createGoogleEvent(userId, {
        summary: task.title,
        description: fullDescription || undefined,
        start: new Date(task.timeBlockStart).toISOString(),
        end: new Date(task.timeBlockEnd).toISOString(),
      });
      return gcalEvent?.id ?? null;
    }

    return task.calendarEventId ?? null;
  } catch (err) {
    console.warn('[calendar] Google Calendar sync failed:', err);
    return task.calendarEventId ?? null;
  }
}

/**
 * Create a Google Calendar event (optionally with Meet link).
 */
export async function createGoogleEvent(
  userId: string,
  event: {
    summary: string;
    description?: string;
    start: string;
    end: string;
    addMeetLink?: boolean;
  }
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  try {
    const eventBody: any = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
    };

    if (event.addMeetLink) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `meet-${randomBytes(8).toString('hex')}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      conferenceDataVersion: event.addMeetLink ? 1 : 0,
    });

    return response.data;
  } catch {
    return null;
  }
}
