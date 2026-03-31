import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackAccess } from '@/lib/auth-guard';
import { cacheHeaders } from '@/lib/api-helpers';
import { parseBody, createTaskSchema } from '@/lib/schemas';
import { parseRRule } from '@/lib/recurrence';
import { parseLocalDate } from '@/lib/date-utils';
import { syncTaskCalendarEvent } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';
import { checkAndCreateDueProcessTasks } from '@/lib/process-task-checker';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Create maintenance tasks for any due processes (idempotent)
  await checkAndCreateDueProcessTasks();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const goalId = searchParams.get('goalId');
  const status = searchParams.get('status');
  const taskType = searchParams.get('taskType');

  const scope = searchParams.get('scope');
  const includeUnscheduled = searchParams.get('includeUnscheduled') === 'true';

  // Build access filter (who can see what)
  const accessFilter: any = {};
  if (scope === 'company') {
    const companyStacks = await prisma.goalStack.findMany({
      where: { isCompany: true },
      select: { id: true },
    });
    const companyGoals = await prisma.goal.findMany({
      where: { stackId: { in: companyStacks.map((s) => s.id) }, deletedAt: null },
      select: { id: true },
    });
    accessFilter.OR = [
      { goalId: { in: companyGoals.map((g) => g.id) } },
      { taskType: { in: ['REACT', 'MAINTENANCE'] } },
    ];
  } else if (!auth.session.user.isAdmin) {
    // Non-admins see tasks they own OR are assigned to
    accessFilter.OR = [
      { ownerId: auth.userId },
      { assigneeId: auth.userId },
    ];
  }

  // Build date filter
  const dateFilter: any = {};
  if (startDate && endDate) {
    const rangeStart = parseLocalDate(startDate);
    const rangeEnd = parseLocalDate(endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    if (includeUnscheduled) {
      dateFilter.OR = [
        { dueDate: { gte: rangeStart, lt: rangeEnd } },
        { dueDate: null },
      ];
    } else {
      dateFilter.dueDate = { gte: rangeStart, lt: rangeEnd };
    }
  } else if (date) {
    const start = parseLocalDate(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    if (includeUnscheduled) {
      dateFilter.OR = [
        { dueDate: { gte: start, lt: end } },
        { dueDate: null },
      ];
    } else {
      dateFilter.dueDate = { gte: start, lt: end };
    }
  }

  // Build additional filters
  const extraFilter: any = {};
  if (goalId) extraFilter.goalId = goalId;
  if (status) extraFilter.status = status;
  if (taskType) extraFilter.taskType = taskType;

  // Combine all filters with AND so OR clauses don't overwrite each other
  const conditions = [accessFilter, dateFilter, extraFilter].filter(
    (f) => Object.keys(f).length > 0
  );
  const where: any = conditions.length > 1 ? { AND: conditions } : conditions[0] || {};

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
    ],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      goal: { select: { id: true, title: true, level: true, stack: { select: { name: true } } } },
      processExecution: { include: { process: { select: { title: true } } } },
      _count: { select: { comments: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
    },
  });

  return new Response(JSON.stringify(tasks), {
    headers: cacheHeaders(5, 30),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createTaskSchema);
  if ('error' in parsed) return parsed.error;
  const { taskType, title, description, priority, dueDate, goalId, processId, ownerId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd, isWinTheDay } = parsed.data;

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
    const accessDenied = checkStackAccess(goal.stack, auth.userId, auth.session.user.isAdmin);
    if (accessDenied) return accessDenied;
  }

  // Validate processId if provided
  if (processId) {
    const process = await prisma.process.findUnique({ where: { id: processId } });
    if (!process) {
      return Response.json({ error: 'Process not found' }, { status: 404 });
    }
  }

  // For certain task types, allow admins to set ownerId (the person responsible)
  const effectiveOwnerId = (ownerId && auth.session.user.isAdmin)
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
      estimatedMinutes: estimatedMinutes ?? undefined,
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
    const eventId = await syncTaskCalendarEvent(auth.userId, task, 'create');
    if (eventId) {
      await prisma.task.update({ where: { id: task.id }, data: { calendarEventId: eventId } });
      (task as any).calendarEventId = eventId;
    }
  }

  return Response.json(task, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
