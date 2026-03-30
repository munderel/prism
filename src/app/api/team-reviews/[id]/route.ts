import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as any;

  if (body.reviewType !== undefined && !['WEEKLY', 'MONTHLY', 'YEARLY'].includes(body.reviewType)) {
    return Response.json({ error: 'Invalid reviewType' }, { status: 400 });
  }
  if (body.dayOfWeek !== undefined && (body.dayOfWeek < 0 || body.dayOfWeek > 6)) {
    return Response.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
  }
  if (body.time !== undefined && !/^\d{2}:\d{2}$/.test(body.time)) {
    return Response.json({ error: 'time must be HH:mm format' }, { status: 400 });
  }
  if (body.duration !== undefined && body.duration < 1) {
    return Response.json({ error: 'duration must be at least 1 minute' }, { status: 400 });
  }

  const data: any = {};
  if (body.reviewType !== undefined) data.reviewType = body.reviewType;
  if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek;
  if (body.time !== undefined) data.time = body.time;
  if (body.duration !== undefined) data.duration = body.duration;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const record = await prisma.recurringTeamReview.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(record);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.recurringTeamReview.update({
    where: { id },
    data: { isActive: false },
  });

  return Response.json({ ok: true });
}
