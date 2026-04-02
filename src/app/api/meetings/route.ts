import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { createGoogleEvent, hasGoogleAccount, getUserSyncCalendarId } from '@/lib/calendar';

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

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { title, description, cadence, dayOfWeek, occurDate, timeStart, timeEnd, attendeeIds } = parsed.data;

  if (!title || !cadence || !timeStart || !timeEnd) {
    return Response.json(
      { error: 'title, cadence, timeStart, and timeEnd are required' },
      { status: 400 }
    );
  }

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

  // Sync ONE_TIME meetings to Google Calendar — fire-and-forget
  if (cadence === 'ONE_TIME' && occurDate) {
    const syncToGcal = async () => {
      const hasGoogle = await hasGoogleAccount(auth.userId);
      if (!hasGoogle) return;
      const targetCalendarId = await getUserSyncCalendarId(auth.userId);
      const dateStr = new Date(occurDate).toISOString().split('T')[0];
      const gcalEvent = await createGoogleEvent(auth.userId, {
        summary: title,
        description: description || undefined,
        start: new Date(`${dateStr}T${timeStart}:00`).toISOString(),
        end: new Date(`${dateStr}T${timeEnd}:00`).toISOString(),
      }, targetCalendarId);
      if (gcalEvent?.id) {
        await prisma.meeting.update({ where: { id: meeting.id }, data: { calendarEventId: gcalEvent.id } });
      }
    };
    syncToGcal().catch((err) => console.warn('[meetings] Google Calendar sync failed:', err));
  }

  return Response.json(meeting, { status: 201 });
}
