import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson, pickDefined } from '@/lib/api-helpers';

const VALID_REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

const TEAM_REVIEW_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  if (body.reviewType !== undefined && !VALID_REVIEW_TYPES.includes(body.reviewType)) {
    return Response.json({ error: 'Invalid reviewType' }, { status: 400 });
  }
  if (body.dayOfWeek != null && (body.dayOfWeek < 0 || body.dayOfWeek > 6)) {
    return Response.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
  }
  if (body.time !== undefined && !/^\d{2}:\d{2}$/.test(body.time)) {
    return Response.json({ error: 'time must be HH:mm format' }, { status: 400 });
  }
  if (body.duration !== undefined && body.duration < 1) {
    return Response.json({ error: 'duration must be at least 1 minute' }, { status: 400 });
  }

  const data: any = pickDefined(body, ['reviewType', 'dayOfWeek', 'recurrenceRule', 'time', 'duration', 'isActive']);

  if (Array.isArray(body.memberIds)) {
    await prisma.recurringTeamReviewMember.deleteMany({
      where: { recurringTeamReviewId: id },
    });
    data.members = {
      create: body.memberIds.map((userId: string) => ({ userId })),
    };
  }

  const record = await prisma.recurringTeamReview.update({
    where: { id },
    data,
    include: TEAM_REVIEW_INCLUDE,
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
