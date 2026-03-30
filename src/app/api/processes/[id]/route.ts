import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const process = await prisma.process.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      delegate: { select: { id: true, name: true, email: true } },
      steps: { orderBy: { sortOrder: 'asc' } },
      executions: {
        orderBy: { scheduledDate: 'desc' },
        take: 10,
        include: {
          executedBy: { select: { id: true, name: true } },
          task: { select: { id: true, status: true, completedAt: true } },
        },
      },
    },
  });

  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  return Response.json(process);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const process = await prisma.process.findUnique({ where: { id } });
  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  // Handle per-execution time override (drag-drop from calendar)
  if (body.scheduledDate && (body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined)) {
    const date = new Date(body.scheduledDate);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date.getTime() + 86400000);

    let execution = await prisma.processExecution.findFirst({
      where: {
        processId: id,
        scheduledDate: { gte: date, lt: nextDay },
      },
    });

    if (!execution) {
      execution = await prisma.processExecution.create({
        data: {
          processId: id,
          executedById: auth.userId,
          scheduledDate: date,
        },
      });
    }

    const updated = await prisma.processExecution.update({
      where: { id: execution.id },
      data: {
        ...(body.timeBlockStart !== undefined && { timeBlockStart: body.timeBlockStart ? new Date(body.timeBlockStart) : null }),
        ...(body.timeBlockEnd !== undefined && { timeBlockEnd: body.timeBlockEnd ? new Date(body.timeBlockEnd) : null }),
      },
    });

    return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  }

  const isAdmin = auth.session.user.isAdmin;

  if (isAdmin) {
    // Admin can update all fields
    const { title, description, assigneeId, delegateId, delegateUntil, cadence, cadenceRule, defaultDurationMinutes, scheduledTime, scheduledDayOfWeek, scheduledDayOfMonth } = body;

    if (defaultDurationMinutes !== undefined && (typeof defaultDurationMinutes !== 'number' || defaultDurationMinutes <= 0)) {
      return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
    }

    const updated = await prisma.process.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(delegateId !== undefined && { delegateId: delegateId || null }),
        ...(delegateUntil !== undefined && { delegateUntil: delegateUntil ? new Date(delegateUntil) : null }),
        ...(cadence !== undefined && { cadence }),
        ...(cadenceRule !== undefined && { cadenceRule }),
        ...(defaultDurationMinutes !== undefined && { defaultDurationMinutes }),
        ...(scheduledTime !== undefined && { scheduledTime: scheduledTime || null }),
        ...(scheduledDayOfWeek !== undefined && { scheduledDayOfWeek: scheduledDayOfWeek ?? null }),
        ...(scheduledDayOfMonth !== undefined && { scheduledDayOfMonth: scheduledDayOfMonth ?? null }),
      },
    });
    return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Non-admin: can update delegateId/delegateUntil and calendar scheduling on their own processes
  if (process.assigneeId !== auth.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { delegateId, delegateUntil, scheduledTime, scheduledDayOfWeek, scheduledDayOfMonth } = body;
  const updated = await prisma.process.update({
    where: { id },
    data: {
      ...(delegateId !== undefined && { delegateId: delegateId || null }),
      ...(delegateUntil !== undefined && { delegateUntil: delegateUntil ? new Date(delegateUntil) : null }),
      ...(scheduledTime !== undefined && { scheduledTime: scheduledTime || null }),
      ...(scheduledDayOfWeek !== undefined && { scheduledDayOfWeek: scheduledDayOfWeek ?? null }),
      ...(scheduledDayOfMonth !== undefined && { scheduledDayOfMonth: scheduledDayOfMonth ?? null }),
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

  await prisma.process.delete({ where: { id } });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
