import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';

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

  if (!process) return notFoundResponse('Process');

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
  if (!process) return notFoundResponse('Process');

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

    return Response.json(updated, NO_STORE);
  }

  const isAdmin = auth.session.user.isAdmin;

  if (body.defaultDurationMinutes !== undefined && (typeof body.defaultDurationMinutes !== 'number' || body.defaultDurationMinutes <= 0)) {
    return Response.json({ error: 'defaultDurationMinutes must be a positive number' }, { status: 400 });
  }

  // Non-admin can only update their own processes
  if (!isAdmin && process.assigneeId !== auth.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { delegateId, delegateUntil, scheduledTime, scheduledDayOfWeek, scheduledDayOfMonth } = body;

  const updated = await prisma.process.update({
    where: { id },
    data: {
      // Fields accessible to both admins and assignees
      ...(delegateId !== undefined && { delegateId: delegateId || null }),
      ...(delegateUntil !== undefined && { delegateUntil: delegateUntil ? new Date(delegateUntil) : null }),
      ...(scheduledTime !== undefined && { scheduledTime: scheduledTime || null }),
      ...(scheduledDayOfWeek !== undefined && { scheduledDayOfWeek: scheduledDayOfWeek ?? null }),
      ...(scheduledDayOfMonth !== undefined && { scheduledDayOfMonth: scheduledDayOfMonth ?? null }),
      // Admin-only fields
      ...(isAdmin && pickDefined(body, ['title', 'description', 'cadence', 'cadenceRule', 'defaultDurationMinutes'])),
      ...(isAdmin && body.assigneeId !== undefined && { assigneeId: body.assigneeId || null }),
    },
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

  await prisma.process.delete({ where: { id } });

  return Response.json({ ok: true }, NO_STORE);
}
