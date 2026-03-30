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
  const body = parsed.data;

  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'Meeting not found' }, { status: 404 });
  }

  const { title, description, cadence, dayOfWeek, occurDate, timeStart, timeEnd, attendeeIds } = body;

  const updated = await prisma.meeting.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(cadence !== undefined && { cadence }),
      ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek ?? null }),
      ...(occurDate !== undefined && { occurDate: occurDate ? new Date(occurDate) : null }),
      ...(timeStart !== undefined && { timeStart }),
      ...(timeEnd !== undefined && { timeEnd }),
      ...(attendeeIds !== undefined && { attendeeIds }),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: 'Meeting not found' }, { status: 404 });
  }

  await prisma.meeting.delete({ where: { id } });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
