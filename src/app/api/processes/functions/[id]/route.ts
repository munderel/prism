import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, createProcessSchema, updateBusinessFunctionSchema } from '@/lib/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await parseBody(request, createProcessSchema);
  if ('error' in parsed) return parsed.error;
  const { title, description, cadence, assigneeId, defaultDurationMinutes, scheduledTime, scheduledDayOfWeek, scheduledDayOfMonth, scheduleStartDate, mode, durationEndDate } = parsed.data;

  // Compute initial nextDueAt if a start date is provided
  let initialNextDueAt: Date | undefined;
  if (scheduleStartDate && scheduledTime) {
    const [h, m] = scheduledTime.split(':').map(Number);
    const start = new Date(scheduleStartDate);
    start.setHours(h, m, 0, 0);
    initialNextDueAt = start;
  }

  const process = await prisma.process.create({
    data: {
      functionId: id,
      title,
      description: description || null,
      cadence: cadence || 'WEEKLY',
      assigneeId: assigneeId || null,
      ...(mode && { mode }),
      ...(durationEndDate !== undefined && { durationEndDate: durationEndDate ? new Date(durationEndDate) : null }),
      ...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
      ...(scheduledTime !== undefined && { scheduledTime: scheduledTime || null }),
      ...(scheduledDayOfWeek !== undefined && { scheduledDayOfWeek: scheduledDayOfWeek ?? null }),
      ...(scheduledDayOfMonth !== undefined && { scheduledDayOfMonth: scheduledDayOfMonth ?? null }),
      ...(scheduleStartDate && { scheduleStartDate: new Date(scheduleStartDate) }),
      ...(initialNextDueAt && { nextDueAt: initialNextDueAt }),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(process, { status: 201, ...NO_STORE });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await parseBody(request, updateBusinessFunctionSchema);
  if ('error' in parsed) return parsed.error;

  const fn = await prisma.businessFunction.update({
    where: { id },
    data: pickDefined(parsed.data, ['name', 'description']),
  });

  return Response.json(fn, NO_STORE);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  await prisma.businessFunction.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
