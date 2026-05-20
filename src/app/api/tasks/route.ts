import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, checkStackWriteAccess } from '@/lib/auth-guard';
import { NO_STORE, USER_SUMMARY_SELECT } from '@/lib/api-helpers';
import { parseBody, createTaskSchema } from '@/lib/schemas';
import { parseRRule } from '@/lib/recurrence';
import { parseDateOnly, parseTaskDueInput } from '@/lib/date-utils';
import { syncTaskCalendarEvent } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';
import { checkAndCreateDueProcessTasks } from '@/lib/process-task-checker';

const GOAL_WITH_PARENT_SELECT = {
  id: true,
  title: true,
  level: true,
  stack: { select: { name: true } },
  parent: { select: { id: true, title: true, level: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  // Lazily generate process tasks for the current period (idempotent)
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
  // When a date range is supplied, visibility (hide-until) is handled by the
  // range-overlap filter below, so the upcomingFilter would over-exclude tasks
  // whose startTime falls inside the requested window.
  const hasDateRange = !!((startDate && endDate) || date);
  const parentId = searchParams.get('parentId');
  const includeUpcoming = searchParams.get('includeUpcoming') === 'true' || !!parentId || hasDateRange;
  const upcomingFilter: Record<string, unknown> = includeUpcoming
    ? {}
    : { OR: [{ startTime: null }, { startTime: { lte: new Date() } }] };

  const isAdmin = !!auth.session.user.isAdmin;
  // Admin-only opt-ins. Future "view as user X" overrides should slot in here
  // and stay admin-gated.
  const includeOwned = searchParams.get('includeOwned') === 'true' && isAdmin;
  const delegatedByMe = searchParams.get('delegatedByMe') === 'true' && isAdmin;

  // Process page bypass: when a processId is supplied AND the requester owns
  // the process (assignee, active delegate, or admin), the processId itself
  // is the access boundary. The page is object-centric — show every task
  // under the process regardless of who it's currently assigned to.
  const processIdParam = searchParams.get('processId');
  let processBypass = false;
  if (processIdParam) {
    const proc = await prisma.process.findUnique({
      where: { id: processIdParam },
      select: { assigneeId: true, delegateId: true, delegateUntil: true },
    });
    if (proc) {
      const now = new Date();
      const isProcessAssignee = proc.assigneeId === auth.userId;
      const isActiveDelegate =
        proc.delegateId === auth.userId && !!proc.delegateUntil && proc.delegateUntil >= now;
      if (isAdmin || isProcessAssignee || isActiveDelegate) {
        processBypass = true;
      }
    }
  }

  // Build access filter (who can see what)
  const accessFilter: Record<string, unknown> = {};
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
      { goalId: { in: companyGoals.map((g) => g.id) }, assigneeId: null },
      { goalId: { in: companyGoals.map((g) => g.id) }, assigneeId: auth.userId },
      { taskType: { in: ['REACT', 'MAINTENANCE'] }, assigneeId: null },
      { taskType: { in: ['REACT', 'MAINTENANCE'] }, assigneeId: auth.userId },
    ];
  } else if (delegatedByMe) {
    // Admin opt-in: tasks I created but routed to someone else.
    accessFilter.AND = [
      { ownerId: auth.userId },
      { assigneeId: { not: null } },
      { assigneeId: { not: auth.userId } },
    ];
  } else if (processBypass) {
    // processId acts as the access boundary; no assignee/owner filter applied.
  } else {
    // Individual scope is the app-wide default: you see tasks assigned to you,
    // plus your own unassigned tasks. Once a task is assigned away, it
    // disappears from your personal dashboard/reviews/calendar lists.
    // Admins can opt back in via `includeOwned=true` (returns tasks the admin
    // owns, even if assigned away) or `delegatedByMe=true` (only assigned-away
    // tasks). Both flags are silently ignored for non-admins.
    accessFilter.OR = [
      { assigneeId: auth.userId },
      { ownerId: auth.userId, assigneeId: null },
      ...(includeOwned ? [{ ownerId: auth.userId }] : []),
    ];
  }

  // Unscheduled-only mode: return only tasks with no date and no time block
  const unscheduledOnly = searchParams.get('unscheduledOnly') === 'true';
  if (unscheduledOnly) {
    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          accessFilter,
          { dueDate: null, timeBlockStart: null },
          { parentId: null },
          ...(status ? [{ status }] : []),
          ...(taskType ? [{ taskType }] : []),
          ...(Object.keys(upcomingFilter).length > 0 ? [upcomingFilter] : []),
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        assignee: { select: USER_SUMMARY_SELECT },
        goal: { select: GOAL_WITH_PARENT_SELECT },
        _count: { select: { comments: true, children: true } },
        children: { select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true } },
        workBlocks: { orderBy: { start: 'asc' }, select: { id: true, start: true, end: true, completionStatus: true, actualMinutes: true } },
        clearGoals: { select: { id: true, isComplete: true, workBlockId: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return Response.json(tasks, NO_STORE);
  }

  // Build date filter
  const dateFilter: Record<string, unknown> = {};
  if ((startDate && endDate) || date) {
    // Anchor on UTC midnight so the filter matches dueDate storage in any
    // Node TZ. Reject malformed input loudly rather than silently filtering
    // around `now`.
    const rangeStart = parseDateOnly(startDate ?? date!);
    if (!rangeStart) {
      return Response.json({ error: 'Invalid date parameter' }, { status: 400 });
    }
    let rangeEnd: Date;
    if (endDate) {
      const parsed = parseDateOnly(endDate);
      if (!parsed) {
        return Response.json({ error: 'Invalid endDate parameter' }, { status: 400 });
      }
      rangeEnd = parsed;
    } else {
      rangeEnd = new Date(rangeStart);
    }
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    // A task overlaps the requested window when:
    //   • it has a time-block falling inside the window, OR
    //   • it has no startTime and its dueDate falls inside the window
    //     (legacy single-day behavior — show only on the due date), OR
    //   • it has a startTime AND its [startTime, dueDate] window overlaps
    //     the requested range — i.e. show every day from start through due.
    // `lt: rangeEnd` and `gte: rangeStart` exclude NULLs in Postgres, so the
    // third clause naturally requires both startTime and dueDate to be set.
    const rangeConditions = [
      { timeBlockStart: { gte: rangeStart, lt: rangeEnd } },
      { startTime: null, dueDate: { gte: rangeStart, lt: rangeEnd } },
      { startTime: { lt: rangeEnd }, dueDate: { gte: rangeStart } },
    ];
    if (includeUnscheduled) {
      dateFilter.OR = [
        ...rangeConditions,
        { dueDate: null, timeBlockStart: null },
      ];
    } else {
      dateFilter.OR = rangeConditions;
    }
  }

  // Build additional filters
  const extraFilter: Record<string, unknown> = {};
  if (goalId) extraFilter.goalId = goalId;
  if (status) extraFilter.status = status;
  if (taskType) extraFilter.taskType = taskType;
  if (processIdParam) extraFilter.processId = processIdParam;

  // Subtask filtering: by default exclude subtasks from top-level lists
  if (parentId) {
    // Fetch children of a specific task
    extraFilter.parentId = parentId;
  } else if (searchParams.get('includeSubtasks') !== 'true') {
    // Exclude subtasks from top-level queries
    extraFilter.parentId = null;
  }

  // Combine all filters with AND so OR clauses don't overwrite each other
  const conditions = [accessFilter, dateFilter, extraFilter, upcomingFilter].filter(
    (f) => Object.keys(f).length > 0
  );
  const where = conditions.length > 1 ? { AND: conditions } : conditions[0] || {};

  const tasks = await prisma.task.findMany({
    where,
    // Default response ordering used by non-DailyTaskList consumers (dashboard
    // focus view, focus mode, etc.). DailyTaskList re-sorts client-side via
    // compareTasksByScheduledTime so its "scheduled-time-first" rule isn't
    // applied here — see src/lib/task-ordering.ts.
    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' },
    ],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: USER_SUMMARY_SELECT },
      goal: { select: GOAL_WITH_PARENT_SELECT },
      processExecution: { include: { process: { select: { title: true } } } },
      _count: { select: { comments: true, children: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
      children: {
        select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
        orderBy: { createdAt: 'asc' },
      },
      workBlocks: { select: { id: true, start: true, end: true, completionStatus: true, actualMinutes: true } },
      clearGoals: { select: { id: true, isComplete: true, workBlockId: true } },
    },
  });

  return Response.json(tasks, NO_STORE);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createTaskSchema);
  if ('error' in parsed) return parsed.error;
  const { taskType, title, description, priority, dueDate, goalId, processId, ownerId, recurrenceRule, timeBlockStart, timeBlockEnd, startTime, deliverable, estimatedMinutes, preferredTimeStart, preferredTimeEnd, isWinTheDay, parentId, assigneeId } = parsed.data;

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
    if (goal.level !== 'WEEKLY') {
      return Response.json({ error: 'Tasks can only be created under WEEKLY goals' }, { status: 400 });
    }
    // Creating a task under a goal is a restricted write: assignees and
    // company-goal-assignees may contribute tasks to goals they're on.
    const accessDenied = await checkStackWriteAccess(
      goal.stack,
      auth.userId,
      auth.session.user.isAdmin,
      { goalId: goalId!, restricted: true },
    );
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
      dueDate: parseTaskDueInput(dueDate),
      goalId: goalId ?? null,
      processId: processId ?? null,
      recurrenceRule: recurrenceRule ?? null,
      timeBlockStart: timeBlockStart ? new Date(timeBlockStart) : null,
      timeBlockEnd: timeBlockEnd ? new Date(timeBlockEnd) : null,
      startTime: startTime ? new Date(startTime) : null,
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
