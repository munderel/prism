import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';

const MEETING_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

async function findMeetingOrFail(id: string): Promise<{ id: string } | Response> {
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return notFoundResponse('Meeting');
  return meeting;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const meeting = await findMeetingOrFail(id);
  if (meeting instanceof Response) return meeting;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const data: Record<string, unknown> = pickDefined(body, ['title', 'cadence', 'timeStart', 'timeEnd', 'attendeeIds']);
  if (body.description !== undefined) data.description = body.description || null;
  if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek ?? null;
  if (body.occurDate !== undefined) data.occurDate = body.occurDate ? new Date(body.occurDate) : null;

  const updated = await prisma.meeting.update({
    where: { id },
    data,
    include: MEETING_INCLUDE,
  });

  return Response.json(updated, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const meeting = await findMeetingOrFail(id);
  if (meeting instanceof Response) return meeting;

  await prisma.meeting.delete({ where: { id } });
  return Response.json({ ok: true }, NO_STORE);
}
