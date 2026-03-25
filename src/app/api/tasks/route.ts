import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

import { parseRRule } from '@/lib/recurrence';
import { createGoogleEvent, hasGoogleAccount } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const goalId = searchParams.get('goalId');
  const status = searchParams.get('status');
  const taskType = searchParams.get('taskType');

  const where: any = {};

  // Owner filter: non-admins only see their own tasks
  if (!auth.session.user.isAdmin) {
    where.ownerId = auth.userId;
  }

  const includeUnscheduled = searchParams.get('includeUnscheduled') === 'true';

  if (startDate && endDate) {
    // Date range mode: fetch tasks across multiple days
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    if (includeUnscheduled) {
      where.OR = [
        { dueDate: { gte: rangeStart, lt: rangeEnd } },
        { dueDate: null },
      ];
    } else {
      where.dueDate = { gte: rangeStart, lt: rangeEnd };
    }
  } else if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    if (includeUnscheduled) {
      where.OR = [
        { dueDate: { gte: start, lt: end } },
        { dueDate: null },
      ];
    } else {
      where.dueDate = { gte: start, lt: end };
    }
  }

  if (goalId) where.goalId = goalId;
  if (status) where.status = status;
  if (taskType) where.taskType = taskType;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
    ],
    include: {
      goal: { select: { id: true, title: true, level: true, stack: { select: { name: true } } } },
      processExecution: { include: { process: { select: { title: true } } } },
      _count: { select: { comments: true } },
    },
  });

  return new Response(JSON.stringify(tasks), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { taskType, title, description, priority, dueDate, goalId, processId, ownerId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd, isWinTheDay } = body;

  if (!taskType || !title) {
    return Response.json({ error: 'taskType and title are required' }, { status: 400 });
  }

  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return Response.json({ error: 'estimatedMinutes required and must be > 0' }, { status: 400 });
  }

  // IMPROVE tasks require a goalId
  if (taskType === 'IMPROVE') {
    if (!goalId) {
      return Response.json({ error: 'goalId is required for IMPROVE tasks' }, { status: 400 });
    }
    // Verify goal ownership
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: { stack: true },
    });
    if (!goal || goal.deletedAt) {
      return Response.json({ error: 'Goal not found' }, { status: 404 });
    }
    if (!goal.stack.isCompany && goal.stack.ownerId !== auth.userId && !auth.session.user.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Validate processId if provided
  if (processId) {
    const process = await prisma.process.findUnique({ where: { id: processId } });
    if (!process) {
      return Response.json({ error: 'Process not found' }, { status: 404 });
    }
  }

  // For REACT tasks, allow admins to set ownerId (the person responsible)
  const effectiveOwnerId = (taskType === 'REACT' && ownerId && auth.session.user.isAdmin)
    ? ownerId
    : auth.userId;

  // MAINTENANCE tasks must have a valid recurrence rule
  if (taskType === 'MAINTENANCE' && recurrenceRule) {
    try {
      parseRRule(recurrenceRule);
    } catch {
      return Response.json({ error: 'Invalid recurrence rule' }, { status: 400 });
    }
  }

  if (isWinTheDay && dueDate) {
    await unflagOtherWinTheDay(auth.userId, dueDate);
  }

  const task = await prisma.task.create({
    data: {
      ownerId: effectiveOwnerId,
      taskType,
      title,
      description: description ?? null,
      priority: priority ?? 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null,
      goalId: goalId ?? null,
      processId: processId ?? null,
      recurrenceRule: recurrenceRule ?? null,
      timeBlockStart: timeBlockStart ? new Date(timeBlockStart) : null,
      timeBlockEnd: timeBlockEnd ? new Date(timeBlockEnd) : null,
      deliverable: deliverable ?? null,
      estimatedMinutes,
      preferredTimeStart: preferredTimeStart ?? null,
      preferredTimeEnd: preferredTimeEnd ?? null,
      isWinTheDay: isWinTheDay ?? false,
    },
    include: {
      goal: { select: { id: true, title: true, level: true } },
    },
  });

  // Sync to Google Calendar if the task has time blocks
  if (timeBlockStart && timeBlockEnd) {
    try {
      const hasGoogle = await hasGoogleAccount(auth.userId);
      if (hasGoogle) {
        const gcalEvent = await createGoogleEvent(auth.userId, {
          summary: title,
          description: description ?? undefined,
          start: new Date(timeBlockStart).toISOString(),
          end: new Date(timeBlockEnd).toISOString(),
        });
        if (gcalEvent?.id) {
          await prisma.task.update({
            where: { id: task.id },
            data: { calendarEventId: gcalEvent.id },
          });
          (task as any).calendarEventId = gcalEvent.id;
        }
      }
    } catch (err) {
      console.warn('[tasks] Google Calendar sync failed on create:', err);
    }
  }

  return Response.json(task, { status: 201 });
}
