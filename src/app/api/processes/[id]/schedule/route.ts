import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
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

/**
 * POST /api/processes/[id]/schedule
 *
 * Body:
 *   time: string          – "HH:mm"
 *   dayOfWeek?: number    – 0=Sun..6=Sat  (for WEEKLY / BIWEEKLY)
 *   dayOfMonth?: number   – 1..31         (for MONTHLY / QUARTERLY)
 *   month?: number        – 0..11         (for YEARLY)
 *   date?: string         – "YYYY-MM-DD"  (for YEARLY or ONE_TIME)
 *
 * Creates a ProcessExecution + Task with time blocks for the next occurrence.
 */
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

  // Fetch the process
  const process = await prisma.process.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true } },
      delegate: { select: { id: true } },
    },
  });

  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  // Determine responsible user
  const now = new Date();
  const today = startOfDay(now);
  let responsibleUserId: string | null = null;

  if (
    process.delegateId &&
    process.delegateUntil &&
    process.delegateUntil >= today
  ) {
    responsibleUserId = process.delegateId;
  } else if (process.assigneeId) {
    responsibleUserId = process.assigneeId;
  }

  // Fall back to the requesting user
  if (!responsibleUserId) {
    responsibleUserId = auth.userId;
  }

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

  // Create Task + ProcessExecution in a transaction
  const { task, execution } = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        ownerId: responsibleUserId!,
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

    // Update process nextDueAt
    await tx.process.update({
      where: { id: process.id },
      data: {
        nextDueAt: scheduledStart,
      },
    });

    return { task, execution };
  });

  return Response.json({ task, execution }, { status: 201 });
}

/**
 * Compute the concrete scheduled datetime based on cadence and user selections.
 */
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

  switch (cadence) {
    case 'DAILY': {
      // Next occurrence: today or tomorrow at the specified time
      base = setHours(setMinutes(startOfDay(now), minutes), hours);
      if (isBefore(base, now)) {
        base = setHours(setMinutes(startOfDay(new Date(now.getTime() + 86400000)), minutes), hours);
      }
      return base;
    }

    case 'WEEKLY':
    case 'BIWEEKLY': {
      // dayOfWeek: 0=Sun..6=Sat
      const dow = dayOfWeek !== undefined ? dayOfWeek : now.getDay();
      base = setHours(setMinutes(setDay(startOfDay(now), dow, { weekStartsOn: 0 }), minutes), hours);
      if (isBefore(base, now)) {
        base = cadence === 'BIWEEKLY' ? addWeeks(base, 2) : addWeeks(base, 1);
      }
      return base;
    }

    case 'MONTHLY':
    case 'QUARTERLY': {
      const dom = dayOfMonth !== undefined ? Math.min(dayOfMonth, 28) : now.getDate();
      base = setHours(setMinutes(setDate(startOfDay(now), dom), minutes), hours);
      if (isBefore(base, now)) {
        base = cadence === 'QUARTERLY' ? addMonths(base, 3) : addMonths(base, 1);
      }
      return base;
    }

    case 'YEARLY': {
      if (dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        base = new Date(y, m - 1, d, hours, minutes);
        if (isBefore(base, now)) {
          base = addYears(base, 1);
        }
        return base;
      }
      // Fallback: one year from now at selected time
      base = setHours(setMinutes(startOfDay(addYears(now, 1)), minutes), hours);
      return base;
    }

    case 'ONE_TIME': {
      if (dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d, hours, minutes);
      }
      return setHours(setMinutes(startOfDay(now), minutes), hours);
    }

    default: {
      // Fallback: tomorrow at selected time
      base = setHours(setMinutes(startOfDay(new Date(now.getTime() + 86400000)), minutes), hours);
      return base;
    }
  }
}
