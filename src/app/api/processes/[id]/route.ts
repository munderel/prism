import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { notFoundResponse, pickDefined, NO_STORE } from '@/lib/api-helpers';
import { parseBody, updateProcessSchema } from '@/lib/schemas';
import { cleanupCurrentPeriodTasks } from '@/lib/process-task-generator';
import { syncManagedSeriesOverride } from '@/lib/google-recurring-sync';
import { parseLocalDateKey } from '@/lib/google-sync-state';

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
  const parsed = await parseBody(request, updateProcessSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const process = await prisma.process.findUnique({ where: { id } });
  if (!process) return notFoundResponse('Process');

  // Handle per-execution time override (drag-drop from calendar)
  if (body.scheduledDate && (body.timeBlockStart !== undefined || body.timeBlockEnd !== undefined)) {
    const owner = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const userTz = owner?.timezone ?? 'America/New_York';
    const date = parseLocalDateKey(body.scheduledDate, userTz);
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

    if (updated.timeBlockStart && updated.timeBlockEnd) {
      try {
        await syncManagedSeriesOverride({
          userId: auth.userId,
          date: updated.scheduledDate,
          start: updated.timeBlockStart,
          end: updated.timeBlockEnd,
          selector: (state) => state.processes?.[id],
          writer: (state, series) => {
            state.processes = state.processes ?? {};
            if (series) {
              state.processes[id] = series;
            } else {
              delete state.processes[id];
            }
          },
        });
      } catch (err) {
        console.warn('[processes] Google Calendar recurring sync failed:', err);
      }
    }

    return Response.json(updated, NO_STORE);
  }

  const isAdmin = auth.session.user.isAdmin;

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
      ...(isAdmin && pickDefined(body, ['title', 'description', 'cadence', 'cadenceRule', 'defaultDurationMinutes', 'mode'])),
      ...(isAdmin && body.durationEndDate !== undefined && { durationEndDate: body.durationEndDate ? new Date(body.durationEndDate) : null }),
      ...(isAdmin && body.assigneeId !== undefined && { assigneeId: body.assigneeId || null }),
      ...(isAdmin && body.scheduleStartDate !== undefined && {
        scheduleStartDate: body.scheduleStartDate ? new Date(body.scheduleStartDate) : null,
      }),
    },
  });

  // On significant changes, invalidate current-period TODO tasks so checker recreates them fresh
  if (isAdmin && updated.mode === 'ADVANCED') {
    const significantChange =
      (newMode !== undefined && newMode !== process.mode) ||
      (body.cadence !== undefined && body.cadence !== process.cadence) ||
      (body.assigneeId !== undefined && body.assigneeId !== process.assigneeId) ||
      body.regenerate === true;

    if (significantChange) {
      await cleanupCurrentPeriodTasks(id, updated.cadence);
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
