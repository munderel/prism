import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { syncFoodBlockCalendarEvent } from '@/lib/calendar';

const createFoodBlockSchema = z.object({
  title: z.string().min(1).max(120),
  startAt: z.string(),
  endAt: z.string(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  const where: { userId: string; startAt?: { gte?: Date; lte?: Date } } = {
    userId: auth.userId,
  };
  if (start || end) {
    where.startAt = {};
    if (start) where.startAt.gte = new Date(start);
    if (end) where.startAt.lte = new Date(`${end}T23:59:59.999Z`);
  }

  const blocks = await prisma.foodBlock.findMany({
    where,
    orderBy: { startAt: 'asc' },
  });
  return Response.json(blocks);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createFoodBlockSchema);
  if ('error' in parsed) return parsed.error;
  const { title, startAt, endAt, notes } = parsed.data;

  const block = await prisma.foodBlock.create({
    data: {
      userId: auth.userId,
      title,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      notes: notes ?? null,
    },
  });

  // Push to Google Calendar immediately (degrades gracefully if not linked).
  const eventId = await syncFoodBlockCalendarEvent(auth.userId, block, 'create');
  if (eventId && eventId !== block.calendarEventId) {
    await prisma.foodBlock.update({
      where: { id: block.id },
      data: { calendarEventId: eventId, syncedAt: new Date(), syncError: null },
    });
    block.calendarEventId = eventId;
  }

  return Response.json(block, { status: 201 });
}
