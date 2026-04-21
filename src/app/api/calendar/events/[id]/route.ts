import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, updateCalendarEventSchema } from '@/lib/schemas';
import { deleteGoogleEvent, updateGoogleEvent } from '@/lib/calendar';

// Prism-level ownership gate for Google Calendar events. A Google OAuth
// token lets the user touch events on any calendar they have write access
// to (including shared team calendars). Before Prism acts as a proxy, we
// insist the event is linked to a Prism row the caller owns — otherwise
// Prism becomes a silent tool for mutating calendars the product has no
// reason to be involved with.
//
// Returns:
//   { status: 'ok' }         — caller owns a Prism row referencing the event
//   { status: 'not-found' }  — no Prism row references this event
//   { status: 'forbidden' }  — row(s) exist but caller doesn't own them
async function checkPrismOwnership(
  userId: string,
  eventId: string,
  isAdmin: boolean,
): Promise<{ status: 'ok' | 'not-found' | 'forbidden' }> {
  const [task, review, powerdown, meeting, aimInstance] = await Promise.all([
    prisma.task.findFirst({
      where: { calendarEventId: eventId },
      select: { ownerId: true, assigneeId: true },
    }),
    prisma.review.findFirst({
      where: { calendarEventId: eventId },
      select: { userId: true },
    }),
    prisma.powerdownSession.findFirst({
      where: { calendarEventId: eventId },
      select: { userId: true },
    }),
    prisma.meeting.findFirst({
      where: { calendarEventId: eventId },
      select: { createdById: true },
    }),
    prisma.aimInstance.findFirst({
      where: { calendarEventId: eventId },
      select: { userId: true },
    }),
  ]);

  if (!task && !review && !powerdown && !meeting && !aimInstance) {
    return { status: 'not-found' };
  }

  if (isAdmin) return { status: 'ok' };

  const owned =
    (task && (task.ownerId === userId || task.assigneeId === userId)) ||
    (review && review.userId === userId) ||
    (powerdown && powerdown.userId === userId) ||
    (meeting && meeting.createdById === userId) ||
    (aimInstance && aimInstance.userId === userId);

  return { status: owned ? 'ok' : 'forbidden' };
}

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
  const ownership = await checkPrismOwnership(auth.userId, eventId, auth.session.user.isAdmin);
  if (ownership.status === 'not-found') {
    return Response.json({ error: 'Event not found' }, { status: 404 });
  }
  if (ownership.status === 'forbidden') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const calendarId = new URL(request.url).searchParams.get('calendarId') || 'primary';

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
  const ownership = await checkPrismOwnership(auth.userId, eventId, auth.session.user.isAdmin);
  if (ownership.status === 'not-found') {
    return Response.json({ error: 'Event not found' }, { status: 404 });
  }
  if (ownership.status === 'forbidden') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
