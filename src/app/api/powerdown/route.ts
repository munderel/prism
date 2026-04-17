import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined } from '@/lib/api-helpers';
import { parseBody, updatePowerdownSchema } from '@/lib/schemas';
import { getGoogleSyncInfo, updateGoogleEvent } from '@/lib/calendar';
import { syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { parseLocalDateKey } from '@/lib/google-sync-state';
import { updateSpecificStreak, updateDailyStreak, type StreakUpdateResult } from '@/lib/streak-engine';
import { startOfToday } from '@/lib/date-utils';

type PowerdownSession = Awaited<ReturnType<typeof prisma.powerdownSession.findUnique>>;

async function syncPowerdownToGcal(userId: string, session: NonNullable<PowerdownSession>, context: string) {
  if (!session.timeBlockStart || !session.timeBlockEnd) return;
  try {
    if (session.calendarEventId) {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(userId);
      if (!hasGoogle) return;
      await updateGoogleEvent(userId, session.calendarEventId, {
        start: session.timeBlockStart.toISOString(),
        end: session.timeBlockEnd.toISOString(),
      }, targetCalendarId);
      return;
    }
    await syncManagedSeriesOverride({
      userId,
      date: session.sessionDate,
      start: session.timeBlockStart,
      end: session.timeBlockEnd,
      selector: (state) => state.powerdown,
      writer: (state, series) => { state.powerdown = series; },
    });
  } catch (err) {
    console.warn(`[powerdown] Google Calendar sync failed for user=${userId} ${context}:`, err);
  }
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
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

  // Default: today's session — strictly today, not future-dated sessions
  // (calendar drag-to-tomorrow can create sessions with sessionDate=tomorrow
  // and any currentStep, which would otherwise be returned here.)
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const session = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: today, lt: tomorrow },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(session);
}

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: today, lt: tomorrow },
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

  const parsed = await parseBody(request, updatePowerdownSchema);
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
    await syncPowerdownToGcal(auth.userId, updated, `sessionDate=${body.sessionDate}`);

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
  let beeminderError: string | undefined;
  if (body.timeBlockStart !== undefined) data.timeBlockStart = toDateOrNull(body.timeBlockStart);
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = toDateOrNull(body.timeBlockEnd);

  // Atomic completion: only one concurrent request can transition completedAt
  // null -> now(). The winner fires the streak update exactly once. Previous
  // logic used a read-then-write guard that could double-fire under a race
  // (two PATCHes seeing session.completedAt=null) and could show a streak of
  // "2 on day 1".
  let didCompleteNow = false;
  if (body.complete) {
    const completionResult = await prisma.powerdownSession.updateMany({
      where: { id: body.sessionId, completedAt: null },
      data: { completedAt: new Date() },
    });
    didCompleteNow = completionResult.count === 1;
  }

  if (didCompleteNow) {
    await updateSpecificStreak(auth.userId, 'powerdown').catch((err) => console.warn('[streak] powerdown streak update failed:', err));
    const streakResult = await updateDailyStreak(auth.userId, 'powerdown').catch((err) => { console.warn('[streak] update failed:', err); return {} as StreakUpdateResult; });
    if (streakResult?.beeminder?.ok === false) {
      beeminderError = streakResult.beeminder.error;
    }
  }

  const updated = await prisma.powerdownSession.update({ where: { id: body.sessionId }, data });

  await syncPowerdownToGcal(auth.userId, updated, `sessionId=${body.sessionId}`);

  return Response.json({ ...updated, beeminderError });
}
