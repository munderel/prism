import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { regenerateAdvancedModeTasks, updateFutureTaskOwners } from '@/lib/process-task-generator';

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

  // Validate ADVANCED mode requires an assignee
  const newMode = isAdmin ? body.mode : undefined;
  if (newMode === 'ADVANCED' && !process.assigneeId && !body.assigneeId) {
    return Response.json({ error: 'ADVANCED mode requires an assignee' }, { status: 400 });
  }

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
      ...(isAdmin && pickDefined(body, ['title', 'description', 'cadence', 'cadenceRule', 'defaultDurationMinutes', 'mode', 'subtaskMode'])),
      ...(isAdmin && body.assigneeId !== undefined && { assigneeId: body.assigneeId || null }),
      ...(isAdmin && body.scheduleStartDate !== undefined && {
        scheduleStartDate: body.scheduleStartDate ? new Date(body.scheduleStartDate) : null,
      }),
    },
  });

  // Handle ADVANCED mode task regeneration
  if (isAdmin && updated.mode === 'ADVANCED') {
    const modeChanged = newMode !== undefined && newMode !== process.mode;
    const cadenceChanged = body.cadence !== undefined && body.cadence !== process.cadence;
    const subtaskModeChanged = body.subtaskMode !== undefined && body.subtaskMode !== process.subtaskMode;
    const forceRegenerate = body.regenerate === true;
    const startDateChanged = body.scheduleStartDate !== undefined;

    if (modeChanged || cadenceChanged || subtaskModeChanged || forceRegenerate || startDateChanged) {
      regenerateAdvancedModeTasks(id).catch((err) => {
        console.error('[process-update] Failed to regenerate tasks:', err);
      });
    }

    // Handle assignee change: update future task owners
    if (body.assigneeId !== undefined && body.assigneeId !== process.assigneeId && body.assigneeId) {
      updateFutureTaskOwners(id, body.assigneeId).catch((err) => {
        console.error('[process-update] Failed to update task owners:', err);
      });
    }
  }

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
