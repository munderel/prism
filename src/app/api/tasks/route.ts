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
import { checkDerailingTasks } from '@/lib/derailing-checker';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Create maintenance tasks for any due processes (idempotent)
  // Check for derailing tasks and send notifications (throttled to once per 30 min)
  await Promise.all([checkAndCreateDueProcessTasks(), checkDerailingTasks()]);

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
  if ((startDate && endDate) || date) {
    const rangeStart = startDate ? parseLocalDate(startDate) : parseLocalDate(date!);
    const rangeEnd = endDate ? parseLocalDate(endDate) : new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const rangeCondition = { dueDate: { gte: rangeStart, lt: rangeEnd } };
    if (includeUnscheduled) {
      dateFilter.OR = [rangeCondition, { dueDate: null }];
    } else {
      Object.assign(dateFilter, rangeCondition);
    }
  }

  // Build additional filters
  const extraFilter: any = {};
  if (goalId) extraFilter.goalId = goalId;
  if (status) extraFilter.status = status;
  if (taskType) extraFilter.taskType = taskType;
  const processIdParam = searchParams.get('processId');
  if (processIdParam) extraFilter.processId = processIdParam;

  // Subtask filtering: by default exclude subtasks from top-level lists
  const parentId = searchParams.get('parentId');
  if (parentId) {
    // Fetch children of a specific task
    extraFilter.parentId = parentId;
  } else if (searchParams.get('includeSubtasks') !== 'true') {
    // Exclude subtasks from top-level queries
    extraFilter.parentId = null;
  }

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
      _count: { select: { comments: true, children: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
      children: {
        select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return new Response(JSON.stringify(tasks), {
    headers: cacheHeaders(5, 10),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createTaskSchema);
  if ('error' in parsed) return parsed.error;
  const { taskType, title, description, priority, dueDate, goalId, processId, ownerId, recurrenceRule, timeBlockStart, timeBlockEnd, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd, isWinTheDay, parentId, assigneeId } = parsed.data;

  // IMPROVE tasks require a goalId
  if (taskType === 'IMPROVE' && !goalId) {
    return Response.json({ error: 'goalId is required for IMPROVE tasks' }, { status: 400 });
  }

  if (taskType === 'IMPROVE') {
    const goal = await prisma.goal.findUnique({
      where: { id: goalId! },
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
      parentId: parentId ?? null,
      assigneeId: assigneeId ?? null,
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
