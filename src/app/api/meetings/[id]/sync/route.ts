import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse } from '@/lib/api-helpers';
import { createGoogleEvent, getGoogleSyncInfo, buildMeetingRecurrence } from '@/lib/calendar';
import { getLocalDateString } from '@/lib/date-utils';

/**
 * POST /api/meetings/[id]/sync
 *
 * Retry pushing the meeting to Google Calendar. Used by the MeetingsManager
 * row's "Retry sync" button when the initial create-time sync failed.
 * Returns the sync outcome synchronously so the UI can display success or
 * the error message immediately.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return notFoundResponse('Meeting');

  // Only the meeting's creator (or a super-user — we already gated on admin)
  // should be able to sign-for-them to Google. Signing as another admin's
  // identity would land the event in the wrong calendar and surface as a
  // permissions error on retry.
  if (meeting.createdById !== auth.userId) {
    return Response.json(
      { error: 'Only the meeting creator can retry sync for this meeting' },
      { status: 403 },
    );
  }

  const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(meeting.createdById);
  if (!hasGoogle) {
    await prisma.meeting.update({
      where: { id },
      data: { syncError: 'Google Calendar is not connected. Reconnect in Settings.' },
    });
    return Response.json({ ok: false, error: 'not_connected' }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: meeting.createdById },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? 'America/New_York';

  const resolvedAttendeeIds = (meeting.attendeeIds ?? []) as string[];
  let attendeeEmails: Array<{ email: string }> = [];
  if (resolvedAttendeeIds.length > 0) {
    const attendees = await prisma.user.findMany({
      where: { id: { in: resolvedAttendeeIds } },
      select: { email: true },
    });
    attendeeEmails = attendees
      .filter((a) => a.email && /.+@.+\..+/.test(a.email))
      .map((a) => ({ email: a.email }));
  }

  let dateStr: string;
  if (meeting.cadence === 'ONE_TIME' && meeting.occurDate) {
    dateStr = getLocalDateString(meeting.occurDate);
  } else if (meeting.dayOfWeek != null) {
    const today = new Date();
    const daysUntil = (meeting.dayOfWeek - today.getDay() + 7) % 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    dateStr = getLocalDateString(nextDate);
  } else {
    dateStr = getLocalDateString();
  }

  const recurrence = buildMeetingRecurrence(meeting.cadence, meeting.dayOfWeek);

  try {
    const gcalEvent = await createGoogleEvent(meeting.createdById, {
      summary: meeting.title,
      description: meeting.description || undefined,
      start: new Date(`${dateStr}T${meeting.timeStart}:00`).toISOString(),
      end: new Date(`${dateStr}T${meeting.timeEnd}:00`).toISOString(),
      timeZone: tz,
      addMeetLink: !!meeting.meetLink,
      recurrence,
      attendees: attendeeEmails,
      prismType: 'meeting',
    }, targetCalendarId);

    if (!gcalEvent?.id) {
      await prisma.meeting.update({
        where: { id },
        data: { syncError: 'Google did not return an event id.' },
      });
      return Response.json({ ok: false, error: 'no_event_id' }, { status: 502 });
    }

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        calendarEventId: gcalEvent.id,
        meetLink: gcalEvent.hangoutLink ?? meeting.meetLink,
        syncedAt: new Date(),
        syncError: null,
      },
    });
    return Response.json({ ok: true, meeting: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Google Calendar error';
    await prisma.meeting.update({
      where: { id },
      data: { syncError: message },
    });
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
