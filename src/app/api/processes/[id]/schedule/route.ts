import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, safeParseJson } from '@/lib/api-helpers';
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
  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { time, dayOfWeek, dayOfMonth, date: dateStr } = body;

  // Validate time format
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: 'time is required in HH:mm format' }, { status: 400 });
  }

  const [hours, minutes] = time.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Response.json({ error: 'Invalid time' }, { status: 400 });
  }

  const process = await prisma.process.findUnique({ where: { id } });

  if (!process) return notFoundResponse('Process');

  const now = new Date();
  const today = startOfDay(now);

  // Determine responsible user: active delegate > assignee > requesting user
  const hasDelegation = process.delegateId && process.delegateUntil && process.delegateUntil >= today;
  const responsibleUserId = (hasDelegation ? process.delegateId : process.assigneeId) ?? auth.userId;

  // Compute the next occurrence based on cadence + user inputs
  let scheduledStart = computeScheduledDate(
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

  const scheduledEnd = addMinutes(scheduledStart, process.defaultDurationMinutes);

  const { task, execution } = await prisma.$transaction(async (tx) => {
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

    return { task, execution };
  });

  return Response.json({ task, execution }, { status: 201 });
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
