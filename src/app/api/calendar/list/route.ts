import { requireAuth, authError } from '@/lib/auth-guard';
import { getCalendarClient, getGoogleSyncInfo } from '@/lib/calendar';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { hasGoogle } = await getGoogleSyncInfo(auth.userId);
  if (!hasGoogle) {
    return Response.json({
      calendars: [],
      connected: false,
      error: 'Google Calendar is not connected for this account.',
    });
  }

  const calendar = await getCalendarClient(auth.userId);
  if (!calendar) {
    return Response.json({
      calendars: [],
      connected: false,
      error: 'Google Calendar credentials are unavailable. Please reconnect your Google account.',
    });
  }

  try {
    const response = await calendar.calendarList.list();
    const calendars = (response.data.items ?? []).map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary ?? false,
      backgroundColor: cal.backgroundColor,
    }));

    return Response.json({ calendars, connected: true });
  } catch (err) {
    console.warn('[calendar] Failed to list calendars:', err);
    return Response.json({
      calendars: [],
      connected: true,
      error: 'Failed to fetch calendars from Google Calendar. Please try reconnecting your account if this keeps happening.',
    });
  }
}
