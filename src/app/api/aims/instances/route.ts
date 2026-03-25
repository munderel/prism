import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const groupOpen = searchParams.get('groupOpen');

  if (!start || !end) {
    return Response.json({ error: 'start and end query params are required' }, { status: 400 });
  }

  // If groupOpen=true, fetch all group-open sessions from all users (for joining)
  const where: any = {
    scheduledDate: {
      gte: new Date(start),
      lte: new Date(end),
    },
  };

  if (groupOpen === 'true') {
    where.isGroupOpen = true;
  } else {
    where.userId = auth.userId;
  }

  const instances = await prisma.aimInstance.findMany({
    where,
    include: {
      aimCategory: true,
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  return Response.json(instances);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { aimCategoryId, scheduledDate, timeBlockStart, timeBlockEnd, isGroupOpen, selectedActivity } = body;

  if (!aimCategoryId) {
    return Response.json({ error: 'aimCategoryId is required' }, { status: 400 });
  }

  if (!scheduledDate) {
    return Response.json({ error: 'scheduledDate is required' }, { status: 400 });
  }

  // Verify category exists
  const category = await prisma.aimCategory.findUnique({ where: { id: aimCategoryId } });
  if (!category) {
    return Response.json({ error: 'AimCategory not found' }, { status: 404 });
  }

  const instance = await prisma.aimInstance.create({
    data: {
      userId: auth.userId,
      aimCategoryId,
      scheduledDate: new Date(scheduledDate),
      timeBlockStart: timeBlockStart ? new Date(timeBlockStart) : null,
      timeBlockEnd: timeBlockEnd ? new Date(timeBlockEnd) : null,
      isGroupOpen: isGroupOpen ?? false,
      selectedActivity: selectedActivity ?? null,
    },
    include: { aimCategory: true },
  });

  return Response.json(instance, { status: 201 });
}
