import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, safeParseJson } from '@/lib/api-helpers';
import { getGoogleSyncInfo, updateGoogleEvent } from '@/lib/calendar';
import { syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { fromZonedTime } from 'date-fns-tz';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function parseLocalDateKey(dateKey: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, timezone);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const recent = searchParams.get('recent');

  // Date-range query: return all sessions in range
  if (start && end) {
    const sessions = await prisma.powerdownSession.findMany({
      where: {
        userId: auth.userId,
        sessionDate: { gte: new Date(start), lte: new Date(end + 'T23:59:59.999Z') },
      },
      orderBy: { sessionDate: 'desc' },
    });
    return Response.json(sessions);
  }

  // Recent completed sessions query
  if (recent) {
    const take = Math.min(Math.max(parseInt(recent, 10) || 7, 1), 30);
    const sessions = await prisma.powerdownSession.findMany({
      where: {
        userId: auth.userId,
        completedAt: { not: null },
      },
      orderBy: { sessionDate: 'desc' },
      take,
    });
    return Response.json(sessions);
  }

  // Default: today's session
  const session = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: startOfToday() },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(session);
}

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const today = startOfToday();

  const existing = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: today },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return Response.json(existing);
  }

  const session = await prisma.powerdownSession.create({
    data: { userId: auth.userId, sessionDate: today },
  });

  return Response.json(session, { status: 201 });
}

const SESSION_UPDATABLE_FIELDS = [
  'currentStep', 'checklistState', 'tomorrowPlan',
  'distractions', 'gratitudes', 'ideas', 'clearGoals',
];

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  // Support creating/updating a session by date (for calendar drag one-time overrides)
  if (!body.sessionId && body.sessionDate && (body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined)) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const userTz = user?.timezone ?? 'America/New_York';
    const date = parseLocalDateKey(body.sessionDate, userTz);

    let session = await prisma.powerdownSession.findFirst({
      where: { userId: auth.userId, sessionDate: { gte: date, lt: new Date(date.getTime() + 86400000) } },
    });
    if (!session) {
      session = await prisma.powerdownSession.create({
        data: { userId: auth.userId, sessionDate: date },
      });
    }

    const updateData = pickDefined<{ timeBlockStart: Date | null; timeBlockEnd: Date | null }>(
      { timeBlockStart: toDateOrNull(body.timeBlockStart), timeBlockEnd: toDateOrNull(body.timeBlockEnd) },
      ['timeBlockStart', 'timeBlockEnd']
    );
    const updated = await prisma.powerdownSession.update({ where: { id: session.id }, data: updateData });

    // Google Calendar sync — keep legacy one-off events working, but prefer recurring-series exceptions.
    if (updated.timeBlockStart && updated.timeBlockEnd) {
      const syncToGcal = async () => {
        if (updated.calendarEventId) {
          const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
          if (!hasGoogle) return;
          await updateGoogleEvent(auth.userId, updated.calendarEventId, {
            start: updated.timeBlockStart!.toISOString(),
            end: updated.timeBlockEnd!.toISOString(),
          }, targetCalendarId);
          return;
        }

        await syncManagedSeriesOverride({
          userId: auth.userId,
          date: updated.sessionDate,
          start: updated.timeBlockStart!,
          end: updated.timeBlockEnd!,
          selector: (state) => state.powerdown,
          writer: (state, series) => {
            state.powerdown = series;
          },
        });
      };
      try { await syncToGcal(); } catch (err) { console.warn('[powerdown] Google Calendar sync failed:', err); }
    }

    return Response.json(updated);
  }

  if (!body.sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const session = await prisma.powerdownSession.findUnique({ where: { id: body.sessionId } });
  if (!session || session.userId !== auth.userId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const data: Record<string, unknown> = pickDefined(body, SESSION_UPDATABLE_FIELDS);
  if (body.complete && !session.completedAt) data.completedAt = new Date();
  if (body.timeBlockStart !== undefined) data.timeBlockStart = toDateOrNull(body.timeBlockStart);
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = toDateOrNull(body.timeBlockEnd);

  const updated = await prisma.powerdownSession.update({ where: { id: body.sessionId }, data });

  if (updated.timeBlockStart && updated.timeBlockEnd) {
    const syncToGcal = async () => {
      if (updated.calendarEventId) {
        const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
        if (!hasGoogle) return;
        await updateGoogleEvent(auth.userId, updated.calendarEventId, {
          start: updated.timeBlockStart!.toISOString(),
          end: updated.timeBlockEnd!.toISOString(),
        }, targetCalendarId);
        return;
      }

      await syncManagedSeriesOverride({
        userId: auth.userId,
        date: updated.sessionDate,
        start: updated.timeBlockStart!,
        end: updated.timeBlockEnd!,
        selector: (state) => state.powerdown,
        writer: (state, series) => {
          state.powerdown = series;
        },
      });
    };
    try { await syncToGcal(); } catch (err) { console.warn('[powerdown] Google Calendar sync failed:', err); }
  }

  return Response.json(updated);
}
