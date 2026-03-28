import { google } from 'googleapis';
import { prisma } from './prisma';
import { decryptToken } from './crypto';

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
    const requestBody: any = {};
    if (event.summary !== undefined) requestBody.summary = event.summary;
    if (event.description !== undefined) requestBody.description = event.description;
    if (event.start !== undefined) requestBody.start = { dateTime: event.start };
    if (event.end !== undefined) requestBody.end = { dateTime: event.end };

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

  // Decrypt the token if encryption is enabled
  let refreshToken: string;
  if (process.env.TOKEN_ENCRYPTION_KEY) {
    const decrypted = decryptToken(user.googleRefreshToken);
    if (decrypted) {
      refreshToken = decrypted;
    } else {
      // Fallback for pre-migration plaintext tokens
      console.warn(`[calendar] Failed to decrypt refresh token for user ${userId} — using as plaintext (pre-migration token?)`);
      refreshToken = user.googleRefreshToken;
    }
  } else {
    refreshToken = user.googleRefreshToken;
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

  const ids = calendarIds && calendarIds.length > 0 ? calendarIds : ['primary'];

  try {
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
    const allEvents = results.flat();
    allEvents.sort((a, b) => {
      const aTime = a.start?.dateTime ?? a.start?.date ?? '';
      const bTime = b.start?.dateTime ?? b.start?.date ?? '';
      return aTime.localeCompare(bTime);
    });

    return allEvents;
  } catch {
    return [];
  }
}

/**
 * Safely sync a task to Google Calendar: create, update, or delete event.
 * Swallows errors so callers don't need try/catch.
 */
export async function syncTaskCalendarEvent(
  userId: string,
  task: { calendarEventId?: string | null; title: string; description?: string | null; timeBlockStart?: Date | string | null; timeBlockEnd?: Date | string | null },
  action: 'create' | 'update' | 'delete'
): Promise<string | null> {
  try {
    if (action === 'delete' && task.calendarEventId) {
      await deleteGoogleEvent(userId, task.calendarEventId);
      return null;
    }

    if (action === 'update' && task.calendarEventId) {
      await updateGoogleEvent(userId, task.calendarEventId, {
        summary: task.title,
        description: task.description ?? undefined,
        start: task.timeBlockStart ? new Date(task.timeBlockStart).toISOString() : undefined,
        end: task.timeBlockEnd ? new Date(task.timeBlockEnd).toISOString() : undefined,
      });
      return task.calendarEventId;
    }

    if (action === 'create' && task.timeBlockStart && task.timeBlockEnd) {
      const gcalEvent = await createGoogleEvent(userId, {
        summary: task.title,
        description: task.description ?? undefined,
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
          requestId: `meet-${Date.now()}`,
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
