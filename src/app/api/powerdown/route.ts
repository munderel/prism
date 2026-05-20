import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined } from '@/lib/api-helpers';
import { parseBody, updatePowerdownSchema } from '@/lib/schemas';
import { getGoogleSyncInfo, updateGoogleEvent } from '@/lib/calendar';
import { syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { parseLocalDateKey } from '@/lib/google-sync-state';
import { updateSpecificStreak, updateDailyStreak, type StreakUpdateResult } from '@/lib/streak-engine';
import { dayBoundariesForUser } from '@/lib/user-timezone';

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
  const dateParam = searchParams.get('date');

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
  // Use the user's timezone, not server-local — Vercel runs in UTC and a UTC
  // "today" misses or overwrites the wrong day's session for non-UTC users.
  // When `date=YYYY-MM-DD` is supplied (historical view), bound on that day
  // in the user's TZ instead.
  const userForTz = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true },
  });
  const tz = userForTz?.timezone ?? 'America/New_York';
  // parseLocalDateKey returns an Invalid Date for garbage input; mirror the
  // /api/tasks pattern and reject loudly rather than silently filtering
  // around an Invalid anchor (would return nothing on every request).
  let anchor = new Date();
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return Response.json({ error: 'Invalid date parameter' }, { status: 400 });
    }
    anchor = parseLocalDateKey(dateParam, tz);
  }
  const { start: dayStart, end: dayEnd } = dayBoundariesForUser(anchor, tz);

  const session = await prisma.powerdownSession.findFirst({
    where: {
      userId: auth.userId,
      sessionDate: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(session);
}

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const userForTz = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true },
  });
  const tz = userForTz?.timezone ?? 'America/New_York';
  const { start: today, end: tomorrow } = dayBoundariesForUser(new Date(), tz);

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
  'distractions', 'gratitudes', 'ideas',
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
  let streakPaused = false;
  let streakError: string | undefined;
  if (body.timeBlockStart !== undefined) data.timeBlockStart = toDateOrNull(body.timeBlockStart);
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = toDateOrNull(body.timeBlockEnd);

  // Atomic completedAt transition so re-completes don't mis-stamp the completion
  // time. Streak firing is NOT gated on the transition: upsertOrUpdateStreak is
  // per-day idempotent (lastActiveDate >= today early-returns) and Beeminder
  // uses a daystamp requestid for idempotency. Firing on every complete:true
  // self-heals sessions that got completedAt set without a streak update
  // (e.g. from a prior schema regression) — a subsequent tap of "Complete"
  // will still produce the expected streak row.
  if (body.complete) {
    await prisma.powerdownSession.updateMany({
      where: { id: body.sessionId, completedAt: null },
      data: { completedAt: new Date() },
    });

    // Surface streak failures to the client instead of swallowing them. The
    // completedAt write above already happened, so we don't 500 — the user
    // shouldn't have to redo their submission. Instead the client sees
    // streakError, shows a toast, and keeps the user on the final step so a
    // retry tap re-fires the (idempotent) streak update.
    try {
      await updateSpecificStreak(auth.userId, 'powerdown');
      const streakResult: StreakUpdateResult = await updateDailyStreak(auth.userId, 'powerdown');
      if (streakResult?.beeminder?.ok === false) {
        beeminderError = streakResult.beeminder.error;
      }
      if (streakResult?.paused) {
        streakPaused = true;
      }
    } catch (err) {
      streakError = err instanceof Error ? err.message : 'unknown streak update failure';
      console.error('[streak] update failed for user=%s:', auth.userId, err);
    }
  }

  const updated = await prisma.powerdownSession.update({ where: { id: body.sessionId }, data });

  await syncPowerdownToGcal(auth.userId, updated, `sessionId=${body.sessionId}`);

  return Response.json({ ...updated, beeminderError, streakPaused, streakError });
}
