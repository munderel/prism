import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, canAccessProcess } from '@/lib/api-helpers';
import { parseBody, scheduleProcessSchema } from '@/lib/schemas';
import { computeNextDueDate } from '@/lib/process-scheduler';
import {
  setHours,
  setMinutes,
  setDay,
  setDate,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  addMinutes,
  isBefore,
} from 'date-fns';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const parsed = await parseBody(request, scheduleProcessSchema);
  if ('error' in parsed) return parsed.error;
  const { time, dayOfWeek, dayOfMonth, date: dateStr } = parsed.data;

  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Response.json({ error: 'Invalid time' }, { status: 400 });
  }

  const process = await prisma.process.findUnique({ where: { id } });

  if (!process) return notFoundResponse('Process');

  if (!canAccessProcess(process, auth.userId, auth.session.user.isAdmin)) {
    return forbiddenResponse();
  }

  const now = new Date();
  const today = startOfDay(now);

  // Determine responsible user: active delegate > assignee > requesting user
  const hasDelegation = process.delegateId && process.delegateUntil && process.delegateUntil >= today;
  const responsibleUserId = (hasDelegation ? process.delegateId : process.assigneeId) ?? auth.userId;

  // Check if this is the first scheduling with an explicit start date
  const isFirstScheduleWithStartDate = process.scheduleStartDate && !process.lastRunAt;

  let scheduledStart: Date;

  if (isFirstScheduleWithStartDate) {
    // Use the explicit start date as the first occurrence
    const anchor = startOfDay(new Date(process.scheduleStartDate!));
    scheduledStart = setHours(setMinutes(anchor, minutes), hours);
  } else {
    // Compute the next occurrence based on cadence + user inputs
    scheduledStart = computeScheduledDate(
      process.cadence,
      now,
      hours,
      minutes,
      dayOfWeek,
      dayOfMonth,
      dateStr
    );

    // If the computed date is in the past, push it forward one period
    if (isBefore(scheduledStart, now)) {
      const pushed = computeNextDueDate(process.cadence, scheduledStart);
      scheduledStart = setHours(setMinutes(pushed, minutes), hours);
    }
  }

  const scheduledEnd = addMinutes(scheduledStart, process.defaultDurationMinutes);

  const dayStart = startOfDay(scheduledStart);
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const result = await prisma.$transaction(async (tx) => {
    // Idempotency: if this occurrence is already scheduled (re-schedule, retry,
    // or double-click), reuse it instead of creating a duplicate Task +
    // ProcessExecution for the same day (which double-booked the calendar and
    // could double-count toward per-process aggregates).
    const existing = await tx.processExecution.findFirst({
      where: { processId: process.id, scheduledDate: { gte: dayStart, lt: dayEnd } },
    });
    if (existing) {
      const existingTask = existing.taskId
        ? await tx.task.findUnique({ where: { id: existing.taskId } })
        : null;
      return { task: existingTask, execution: existing, duplicate: true };
    }

    const task = await tx.task.create({
      data: {
        ownerId: responsibleUserId,
        taskType: 'MAINTENANCE',
        title: process.title,
        description: process.description,
        dueDate: scheduledStart,
        status: 'TODO',
        priority: 'MEDIUM',
        estimatedMinutes: process.defaultDurationMinutes,
        timeBlockStart: scheduledStart,
        timeBlockEnd: scheduledEnd,
        processId: process.id,
      },
    });

    const execution = await tx.processExecution.create({
      data: {
        processId: process.id,
        executedById: responsibleUserId,
        scheduledDate: scheduledStart,
        taskId: task.id,
      },
    });

    await tx.process.update({
      where: { id: process.id },
      data: { nextDueAt: scheduledStart },
    });

    return { task, execution, duplicate: false };
  });

  return Response.json(
    { task: result.task, execution: result.execution },
    { status: result.duplicate ? 200 : 201 },
  );
}

function computeScheduledDate(
  cadence: string,
  now: Date,
  hours: number,
  minutes: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
  dateStr?: string,
): Date {
  let base: Date;

  function atTime(day: Date): Date {
    return setHours(setMinutes(startOfDay(day), minutes), hours);
  }

  function parseDateStr(): Date {
    const [y, m, d] = dateStr!.split('-').map(Number);
    return new Date(y, m - 1, d, hours, minutes);
  }

  switch (cadence) {
    case 'DAILY': {
      base = atTime(now);
      if (isBefore(base, now)) base = atTime(new Date(now.getTime() + 86400000));
      return base;
    }

    case 'WEEKLY':
    case 'BIWEEKLY': {
      const dow = dayOfWeek ?? now.getDay();
      base = setHours(setMinutes(setDay(startOfDay(now), dow, { weekStartsOn: 0 }), minutes), hours);
      if (isBefore(base, now)) {
        base = addWeeks(base, cadence === 'BIWEEKLY' ? 2 : 1);
      }
      return base;
    }

    case 'MONTHLY':
    case 'QUARTERLY': {
      const dom = dayOfMonth !== undefined ? Math.min(dayOfMonth, 28) : now.getDate();
      base = setHours(setMinutes(setDate(startOfDay(now), dom), minutes), hours);
      if (isBefore(base, now)) {
        base = addMonths(base, cadence === 'QUARTERLY' ? 3 : 1);
      }
      return base;
    }

    case 'YEARLY': {
      if (dateStr) {
        base = parseDateStr();
        return isBefore(base, now) ? addYears(base, 1) : base;
      }
      return atTime(addYears(now, 1));
    }

    case 'ONE_TIME': {
      return dateStr ? parseDateStr() : atTime(now);
    }

    default: {
      return atTime(new Date(now.getTime() + 86400000));
    }
  }
}
