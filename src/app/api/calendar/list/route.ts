import { requireAuth, authError } from '@/lib/auth-guard';
import { getCalendarClient } from '@/lib/calendar';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const calendar = await getCalendarClient(auth.userId);
  if (!calendar) {
    return Response.json({ calendars: [] });
  }

  try {
    const response = await calendar.calendarList.list();
    const calendars = (response.data.items ?? []).map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary ?? false,
      backgroundColor: cal.backgroundColor,
    }));

    return Response.json({ calendars });
  } catch (err) {
    console.warn('[calendar] Failed to list calendars:', err);
    return Response.json({ calendars: [] });
  }
}
