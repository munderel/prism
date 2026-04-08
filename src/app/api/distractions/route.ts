import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { startOfToday } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: Record<string, unknown> = { userId: auth.userId };

  if (startDate && endDate) {
    const rangeEnd = new Date(endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    where.logDate = { gte: new Date(startDate), lt: rangeEnd };
  }

  const distractions = await prisma.distractionLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(distractions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { content, notes, logDate, source } = parsed.data;

  if (!content) {
    return Response.json({ error: 'content is required' }, { status: 400 });
  }

  const today = startOfToday();

  const distraction = await prisma.distractionLog.create({
    data: {
      userId: auth.userId,
      content,
      notes: notes ?? null,
      logDate: logDate ? new Date(logDate) : today,
      source: source ?? 'powerdown',
    },
  });

  return Response.json(distraction, { status: 201 });
}
