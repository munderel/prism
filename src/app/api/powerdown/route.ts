import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, safeParseJson } from '@/lib/api-helpers';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

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
      completedAt: null,
    },
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
    const date = new Date(body.sessionDate);
    date.setHours(0, 0, 0, 0);

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
  if (body.complete) data.completedAt = new Date();
  if (body.timeBlockStart !== undefined) data.timeBlockStart = toDateOrNull(body.timeBlockStart);
  if (body.timeBlockEnd !== undefined) data.timeBlockEnd = toDateOrNull(body.timeBlockEnd);

  const updated = await prisma.powerdownSession.update({ where: { id: body.sessionId }, data });
  return Response.json(updated);
}
