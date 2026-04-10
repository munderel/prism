import { NextRequest } from 'next/server';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, updateCalendarEventSchema } from '@/lib/schemas';
import { deleteGoogleEvent, updateGoogleEvent } from '@/lib/calendar';

/**
 * DELETE /api/calendar/events/[id]?calendarId=primary
 * Delete a Google Calendar event by its GCal event ID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: eventId } = await params;
  const calendarId = request.nextUrl.searchParams.get('calendarId') || 'primary';

  const deleted = await deleteGoogleEvent(auth.userId, eventId, calendarId);
  if (!deleted) {
    return Response.json({ error: 'Failed to delete Google Calendar event' }, { status: 500 });
  }

  return Response.json({ ok: true });
}

/**
 * PATCH /api/calendar/events/[id]
 * Update a Google Calendar event's time (used for drag-to-reschedule).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id: eventId } = await params;
  const parsed = await parseBody(request, updateCalendarEventSchema);
  if ('error' in parsed) return parsed.error;

  const { start, end, calendarId = 'primary' } = parsed.data;

  const updated = await updateGoogleEvent(auth.userId, eventId, {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  }, calendarId);
  if (!updated) {
    return Response.json({ error: 'Failed to update Google Calendar event' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
