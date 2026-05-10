import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateMeetingSchema } from '@/lib/schemas';
import { deleteGoogleEvent, updateGoogleEvent, createGoogleEvent, getGoogleSyncInfo, buildMeetingRecurrence } from '@/lib/calendar';
import { getLocalDateString } from '@/lib/date-utils';

const MEETING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

async function findMeetingOrFail(id: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return notFoundResponse('Meeting');
  return meeting;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const meeting = await findMeetingOrFail(id);
  if (meeting instanceof Response) return meeting;

  const parsed = await parseBody(request, updateMeetingSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: Record<string, unknown> = pickDefined(body, ['title', 'cadence', 'timeStart', 'timeEnd', 'attendeeIds']);
  if (body.description !== undefined) data.description = body.description || null;
  if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek ?? null;
  if (body.occurDate !== undefined) data.occurDate = body.occurDate ? new Date(body.occurDate) : null;

  const updated = await prisma.meeting.update({
    where: { id },
    data,
    include: MEETING_INCLUDE,
  });

  // Sync changes to Google Calendar — fire-and-forget
  const syncToGcal = async () => {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(meeting.createdById);
    if (!hasGoogle) return;

    const cadenceChanged = body.cadence !== undefined && body.cadence !== meeting.cadence;

    if (cadenceChanged && meeting.calendarEventId) {
      // Cadence changed — delete old event then create new one with updated
      // recurrence. If the delete fails we MUST NOT create a replacement,
      // since that would leave the old recurring event live on Google
      // alongside the new one (the user would see duplicates).
      // `deleteGoogleEvent` returns true for 404 (idempotent — event already
      // gone) and false only for real failures.
      const deleted = await deleteGoogleEvent(meeting.createdById, meeting.calendarEventId, targetCalendarId);
      if (!deleted) {
        await prisma.meeting.update({
          where: { id },
          data: { syncError: 'Could not remove old recurring event on Google. Cadence change skipped — try again or run Force Resync from Settings.' },
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: meeting.createdById },
        select: { timezone: true },
      });
      const tz = user?.timezone ?? 'America/New_York';
      const newCadence = body.cadence ?? meeting.cadence;
      const newDayOfWeek = body.dayOfWeek !== undefined ? body.dayOfWeek : meeting.dayOfWeek;
      const recurrence = buildMeetingRecurrence(newCadence, newDayOfWeek);

      // Resolve attendee IDs to email addresses for Google Calendar invitations
      const resolvedAttendeeIds = (updated.attendeeIds ?? []) as string[];
      let attendeeEmails: Array<{ email: string }> = [];
      if (resolvedAttendeeIds.length > 0) {
        const attendeeUsers = await prisma.user.findMany({
          where: { id: { in: resolvedAttendeeIds } },
          select: { email: true },
        });
        attendeeEmails = attendeeUsers.map(a => ({ email: a.email }));
      }

      let dateStr: string;
      if (newCadence === 'ONE_TIME' && (body.occurDate || meeting.occurDate)) {
        const raw = body.occurDate || meeting.occurDate!;
        const asString = typeof raw === 'string' ? raw : new Date(raw).toISOString();
        dateStr = /^\d{4}-\d{2}-\d{2}$/.test(asString) ? asString : getLocalDateString(new Date(asString));
      } else if (newDayOfWeek != null) {
        const today = new Date();
        // Drop the `|| 7` — a meeting whose weekday matches today should
        // stay on today, not be bumped a week forward.
        const daysUntil = (newDayOfWeek - today.getDay() + 7) % 7;
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + daysUntil);
        dateStr = getLocalDateString(nextDate);
      } else {
        dateStr = getLocalDateString();
      }

      const ts = body.timeStart ?? meeting.timeStart;
      const te = body.timeEnd ?? meeting.timeEnd;

      const gcalEvent = await createGoogleEvent(meeting.createdById, {
        summary: body.title ?? meeting.title,
        description: (body.description !== undefined ? body.description : meeting.description) || undefined,
        start: new Date(`${dateStr}T${ts}:00`).toISOString(),
        end: new Date(`${dateStr}T${te}:00`).toISOString(),
        timeZone: tz,
        addMeetLink: !!meeting.meetLink,
        recurrence,
        attendees: attendeeEmails,
        prismType: 'meeting',
        prismRecordId: id,
      }, targetCalendarId);

      if (gcalEvent?.id) {
        const updateData: { calendarEventId: string; meetLink?: string; syncedAt: Date; syncError: null } = {
          calendarEventId: gcalEvent.id,
          syncedAt: new Date(),
          syncError: null,
        };
        if (gcalEvent.hangoutLink) {
          updateData.meetLink = gcalEvent.hangoutLink;
        }
        await prisma.meeting.update({ where: { id }, data: updateData });
      }
    } else if (meeting.calendarEventId) {
      // Simple field update — patch the existing Google Calendar event.
      // Pass recurrence too so a previously-bailed cadence change (where the
      // DB row updated but the Google delete failed, leaving Google on the
      // old cadence) self-heals on the next successful patch.
      const recurrence = buildMeetingRecurrence(
        body.cadence ?? meeting.cadence,
        body.dayOfWeek !== undefined ? body.dayOfWeek : meeting.dayOfWeek,
      );
      await updateGoogleEvent(meeting.createdById, meeting.calendarEventId, {
        summary: body.title,
        description: body.description !== undefined ? (body.description || '') : undefined,
        start: body.timeStart ? new Date(`1970-01-01T${body.timeStart}:00`).toISOString() : undefined,
        end: body.timeEnd ? new Date(`1970-01-01T${body.timeEnd}:00`).toISOString() : undefined,
        recurrence,
      }, targetCalendarId);
    }
  };
  syncToGcal().catch((err) => console.warn('[meetings] Google Calendar sync on update failed:', err));

  return Response.json(updated, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const meeting = await findMeetingOrFail(id);
  if (meeting instanceof Response) return meeting;

  // Delete linked Google Calendar event
  const fullMeeting = await prisma.meeting.findUnique({ where: { id }, select: { calendarEventId: true, createdById: true } });
  if (fullMeeting?.calendarEventId) {
    try {
      const { calendarId: targetCalendarId } = await getGoogleSyncInfo(fullMeeting.createdById);
      await deleteGoogleEvent(fullMeeting.createdById, fullMeeting.calendarEventId, targetCalendarId);
    } catch (err) {
      console.warn('[meetings] Google Calendar sync failed on delete:', err);
    }
  }

  await prisma.meeting.delete({ where: { id } });
  return Response.json({ ok: true }, NO_STORE);
}
