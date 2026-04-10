import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, createMeetingSchema } from '@/lib/schemas';
import { createGoogleEvent, getGoogleSyncInfo, buildMeetingRecurrence } from '@/lib/calendar';

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

  // Sync meeting to Google Calendar (all cadences) — fire-and-forget
  const syncToGcal = async () => {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
    if (!hasGoogle) return;

    // Get user timezone for correct recurring event handling
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? 'America/New_York';

    // Determine the first event date
    let dateStr: string;
    if (cadence === 'ONE_TIME' && occurDate) {
      dateStr = new Date(occurDate).toISOString().split('T')[0];
    } else {
      // For recurring: compute next occurrence of dayOfWeek from today
      const today = new Date();
      if (dayOfWeek != null) {
        const currentDow = today.getDay();
        const daysUntil = (dayOfWeek - currentDow + 7) % 7 || 7;
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + daysUntil);
        dateStr = nextDate.toISOString().split('T')[0];
      } else {
        // No specific day — start tomorrow for daily, or today
        dateStr = today.toISOString().split('T')[0];
      }
    }

    const recurrence = buildMeetingRecurrence(cadence, dayOfWeek ?? null);

    const gcalEvent = await createGoogleEvent(auth.userId, {
      summary: title,
      description: description || undefined,
      start: new Date(`${dateStr}T${timeStart}:00`).toISOString(),
      end: new Date(`${dateStr}T${timeEnd}:00`).toISOString(),
      timeZone: tz,
      addMeetLink: !!addMeetLink,
      recurrence,
    }, targetCalendarId);

    if (gcalEvent?.id) {
      const updateData: { calendarEventId: string; meetLink?: string } = {
        calendarEventId: gcalEvent.id,
      };
      if (gcalEvent.hangoutLink) {
        updateData.meetLink = gcalEvent.hangoutLink;
      }
      await prisma.meeting.update({ where: { id: meeting.id }, data: updateData });
    }
  };
  syncToGcal().catch((err) => console.warn('[meetings] Google Calendar sync failed:', err));

  return Response.json(meeting, { status: 201 });
}
