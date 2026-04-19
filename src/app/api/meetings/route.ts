import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, createMeetingSchema } from '@/lib/schemas';
import { createGoogleEvent, getGoogleSyncInfo, buildMeetingRecurrence } from '@/lib/calendar';
import { getLocalDateString } from '@/lib/date-utils';

const MEETING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const meetings = await prisma.meeting.findMany({
    include: MEETING_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(meetings);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createMeetingSchema);
  if ('error' in parsed) return parsed.error;
  const { title, description, cadence, dayOfWeek, occurDate, timeStart, timeEnd, attendeeIds, addMeetLink } = parsed.data;

  if (cadence === 'ONE_TIME' && !occurDate) {
    return Response.json(
      { error: 'occurDate is required for one-time meetings' },
      { status: 400 }
    );
  }

  const meeting = await prisma.meeting.create({
    data: {
      title,
      description: description || null,
      cadence,
      dayOfWeek: cadence === 'ONE_TIME' ? null : (dayOfWeek ?? null),
      occurDate: cadence === 'ONE_TIME' && occurDate ? new Date(occurDate) : null,
      timeStart,
      timeEnd,
      attendeeIds: Array.from(new Set([...(attendeeIds || []), auth.userId])),
      createdById: auth.userId,
    },
    include: MEETING_INCLUDE,
  });

  // Sync meeting to Google Calendar (all cadences). Fire-and-forget, but
  // the outcome (success or error message) is persisted on the meeting row
  // so the UI can surface sync failures instead of swallowing them.
  const syncToGcal = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
    if (!hasGoogle) {
      return { ok: false, error: 'Google Calendar is not connected. Reconnect in Settings.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? 'America/New_York';

    const resolvedAttendeeIds = meeting.attendeeIds as string[];
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

    // Determine the first occurrence date. Use user-local date keys (not
    // UTC) so evening creators in negative UTC offsets don't shift the
    // meeting to the next calendar day on Google's side.
    let dateStr: string;
    if (cadence === 'ONE_TIME' && occurDate) {
      // occurDate from the form is a YYYY-MM-DD string; normalize rather
      // than round-tripping through toISOString (which forces UTC).
      const asString = typeof occurDate === 'string' ? occurDate : new Date(occurDate).toISOString();
      dateStr = /^\d{4}-\d{2}-\d{2}$/.test(asString) ? asString : getLocalDateString(new Date(asString));
    } else if (dayOfWeek != null) {
      const today = new Date();
      const currentDow = today.getDay();
      const daysUntil = (dayOfWeek - currentDow + 7) % 7;
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + daysUntil);
      dateStr = getLocalDateString(nextDate);
    } else {
      dateStr = getLocalDateString();
    }

    const recurrence = buildMeetingRecurrence(cadence, dayOfWeek ?? null);

    console.info('[meetings] syncing to Google Calendar', {
      meetingId: meeting.id,
      targetCalendarId,
      attendeeCount: attendeeEmails.length,
      attendeeDomains: Array.from(
        new Set(attendeeEmails.map((a) => a.email.split('@')[1]).filter(Boolean)),
      ),
    });

    try {
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        description: description || undefined,
        start: new Date(`${dateStr}T${timeStart}:00`).toISOString(),
        end: new Date(`${dateStr}T${timeEnd}:00`).toISOString(),
        timeZone: tz,
        addMeetLink: addMeetLink !== false,
        recurrence,
        attendees: attendeeEmails,
      }, targetCalendarId);

      if (!gcalEvent?.id) {
        return { ok: false, error: 'Google did not return an event id. Check calendar permissions.' };
      }

      const updateData: {
        calendarEventId: string;
        calendarIdUsed?: string;
        htmlLink?: string;
        meetLink?: string;
        syncedAt: Date;
        syncError: null;
      } = {
        calendarEventId: gcalEvent.id,
        calendarIdUsed: targetCalendarId,
        syncedAt: new Date(),
        syncError: null,
      };
      if (gcalEvent.hangoutLink) {
        updateData.meetLink = gcalEvent.hangoutLink;
      }
      if (gcalEvent.htmlLink) {
        updateData.htmlLink = gcalEvent.htmlLink;
      }
      await prisma.meeting.update({ where: { id: meeting.id }, data: updateData });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Google Calendar error';
      return { ok: false, error: message };
    }
  };

  syncToGcal().then(async (result) => {
    if (!result.ok) {
      console.warn('[meetings] Google Calendar sync failed:', result.error);
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { syncError: result.error, syncedAt: null },
      }).catch(() => {});
    }
  }).catch((err) => console.warn('[meetings] Google Calendar sync threw:', err));

  return Response.json(meeting, { status: 201 });
}
