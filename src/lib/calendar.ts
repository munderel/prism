import { google } from 'googleapis';
import { prisma } from './prisma';

/**
 * Get an authenticated Google Calendar API client for a user.
 * Returns null if the user hasn't connected Google Calendar.
 */
export async function getCalendarClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account?.refresh_token) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
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
 */
export async function listGoogleEvents(
  userId: string,
  timeMin: string,
  timeMax: string
) {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return [];

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    return response.data.items ?? [];
  } catch {
    return [];
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
