import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, createAimInstanceSchema } from '@/lib/schemas';
import { createGoogleEvent, getGoogleSyncInfo, buildEventTimes } from '@/lib/calendar';
import { getAimCompletionUrl } from '@/lib/completion-token';

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
  const where: Prisma.AimInstanceWhereInput = {
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

  const parsed = await parseBody(request, createAimInstanceSchema);
  if ('error' in parsed) return parsed.error;
  const { aimCategoryId, scheduledDate, timeBlockStart, timeBlockEnd, isGroupOpen, selectedActivity } = parsed.data;

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

  // Sync to Google Calendar — fire-and-forget.
  // Syncs both timed events (when timeBlockStart/End are set) and all-day
  // events (scheduledDate-only), so AimInstances without a time block still
  // appear on the user's Google calendar as all-day banners.
  const syncToGcal = async () => {
    const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(auth.userId);
    if (!hasGoogle) return;
    const title = selectedActivity
      ? `${instance.aimCategory.name}: ${selectedActivity}`
      : instance.aimCategory.name;
    const { start, end } = buildEventTimes({
      scheduledDate: instance.scheduledDate,
      timeBlockStart,
      timeBlockEnd,
    });
    const completionUrl = getAimCompletionUrl(instance.id, auth.userId);
    const gcalEvent = await createGoogleEvent(auth.userId, {
      summary: title,
      description: `Mark complete in Prism: ${completionUrl}`,
      start,
      end,
      prismType: 'aim',
    }, targetCalendarId);
    if (gcalEvent?.id) {
      await prisma.aimInstance.update({ where: { id: instance.id }, data: { calendarEventId: gcalEvent.id } });
    }
  };
  syncToGcal().catch((err) => console.warn('[aims] Google Calendar sync failed:', err));

  return Response.json(instance, { status: 201 });
}
