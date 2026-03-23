import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';

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

  const body = await request.json();
  const { title, description, cadence, dayOfWeek, timeStart, timeEnd, attendeeIds } = body;

  if (!title || !cadence || !timeStart || !timeEnd) {
    return Response.json(
      { error: 'title, cadence, timeStart, and timeEnd are required' },
      { status: 400 }
    );
  }

  const meeting = await prisma.meeting.create({
    data: {
      title,
      description: description || null,
      cadence,
      dayOfWeek: dayOfWeek ?? null,
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
