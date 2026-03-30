import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const meetings = await prisma.meeting.findMany({
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(meetings);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { title, description, cadence, dayOfWeek, occurDate, timeStart, timeEnd, attendeeIds } = body;

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
      attendeeIds: attendeeIds || [],
      createdById: auth.userId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(meeting, { status: 201 });
}
