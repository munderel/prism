import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { pickDefined } from '@/lib/api-helpers';
import { parseBody, updateTeamReviewSchema } from '@/lib/schemas';

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

  const parsed = await parseBody(request, updateTeamReviewSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: Record<string, unknown> = pickDefined(body, ['reviewType', 'dayOfWeek', 'recurrenceRule', 'time', 'duration', 'isActive']);

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
