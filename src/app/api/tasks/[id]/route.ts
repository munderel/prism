import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, notFoundResponse, hasAccess, forbiddenResponse, USER_SUMMARY_SELECT } from '@/lib/api-helpers';
import { parseBody, updateTaskSchema } from '@/lib/schemas';
import { cascadeProgressUp } from '@/lib/progress';
import { parseRRule, getNextOccurrence } from '@/lib/recurrence';
import { deleteGoogleEvent, getGoogleSyncInfo, syncTaskCalendarEvent } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';
import { completeTask } from '@/lib/task-completion';
import { parseDateOnly, parseTaskDueInput, toDateOnlyInputValue } from '@/lib/date-utils';
import { getCurrentPeriodRange } from '@/lib/process-task-generator';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: USER_SUMMARY_SELECT },
      goal: {
        select: {
          id: true,
          title: true,
          level: true,
          parent: { select: { id: true, title: true, level: true } },
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: USER_SUMMARY_SELECT },
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      children: {
        select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
        orderBy: { createdAt: 'asc' },
      },
      clearGoals: {
        where: { workBlockId: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, text: true, isComplete: true, sortOrder: true, workBlockId: true },
      },
      workBlocks: {
        orderBy: { start: 'asc' },
        select: {
          id: true, start: true, end: true, mainObjective: true,
          completionStatus: true, actualMinutes: true, notes: true, reviewedAt: true,
        },
      },
      deliverableItems: {
        orderBy: { position: 'asc' },
      },
      _count: { select: { children: true } },
    },
  });

  if (!task) return notFoundResponse('Task');
  // Allow access if user owns the task OR is assigned to it
  const canAccess = hasAccess(task.ownerId, auth.userId, auth.session.user.isAdmin) || task.assigneeId === auth.userId;
  if (!canAccess) return forbiddenResponse();

  return Response.json(task);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return notFoundResponse('Task');
  const canAccess = hasAccess(task.ownerId, auth.userId, auth.session.user.isAdmin) || task.assigneeId === auth.userId;
  if (!canAccess) return forbiddenResponse();

  const parsed = await parseBody(request, updateTaskSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { status, dueDate, timeBlockStart, timeBlockEnd, isWinTheDay } = body;

  const data: Record<string, unknown> = pickDefined(body, [
    'title', 'description', 'priority', 'deliverable', 'estimatedMinutes',
    'preferredTimeStart', 'preferredTimeEnd', 'isPinned', 'isAutoScheduled', 'isWinTheDay', 'winTheDayRank',
    'assigneeId',
  ]);
  if (dueDate !== undefined) data.dueDate = parseTaskDueInput(dueDate);
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;
  if (body.startTime !== undefined) data.startTime = body.startTime ? new Date(body.startTime) : null;

  // When scheduling a task into a time block (e.g. dragging onto the Power Down
  // calendar), bump a past dueDate forward to the new block's date. This stops
  // the task from staying "overdue" after the user has acted on it, and keeps
  // it visible via both the timeBlockStart AND dueDate paths in the calendar
  // GET. Only auto-bumps when:
  //   - a new timeBlockStart is being set (not cleared)
  //   - the caller did not also explicitly specify dueDate (user intent wins)
  //   - the task's existing dueDate is strictly before the new block's date
  //
  // Both keys are derived via toDateOnlyInputValue so the comparison stays
  // consistent with the rest of the dueDate plumbing (PR #27 — date-only
  // fields anchor to UTC midnight; reading via getUTC* preserves the user's
  // picked calendar date). On Vercel (server UTC) this also matches the
  // user's local-day view for any timeBlockStart sent up by the client.
  if (dueDate === undefined && timeBlockStart) {
    const newBlockDateKey = toDateOnlyInputValue(new Date(timeBlockStart));
    const existingDueKey = task.dueDate ? toDateOnlyInputValue(task.dueDate) : null;
    if (existingDueKey && existingDueKey < newBlockDateKey) {
      data.dueDate = parseDateOnly(newBlockDateKey);
    }
  }

  if (isWinTheDay === true && task.dueDate) {
    await unflagOtherWinTheDay(task.ownerId, task.dueDate, id);
  }

  // Status transitions. DONE is handled by completeTask() below, so we don't
  // write status/completedAt here for that transition — it would race with the
  // helper's own status=DONE write.
  const isNewDoneTransition = status === 'DONE' && task.status !== 'DONE';
  if (status !== undefined && !isNewDoneTransition) {
    data.status = status;
    switch (status) {
      case 'IN_PROGRESS':
        if (!task.startedAt) data.startedAt = new Date();
        break;
      case 'DROPPED':
        data.failedAt = new Date();
        break;
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: USER_SUMMARY_SELECT },
    },
  });

  // DONE transition: delegate to the shared completeTask helper which
  // transactionally snapshots progress, flips PENDING blocks to MISSED, and
  // sets status=DONE + completedAt idempotently.
  if (isNewDoneTransition) {
    try {
      await completeTask(id, auth.userId);
    } catch (err) {
      console.warn('[tasks] completion snapshot failed:', err);
    }
  }

  // On completion or drop: handle recurrence + progress cascade (fire-and-forget to avoid blocking response)
  if (status === 'DONE' || status === 'DROPPED') {
    const postUpdate = async () => {
      if (status === 'DONE' && task.recurrenceRule) {
        try {
          const rule = parseRRule(task.recurrenceRule);
          const baseDate = task.dueDate ?? new Date();
          const nextDate = getNextOccurrence(baseDate, rule);
          await prisma.task.create({
            data: {
              ownerId: task.ownerId,
              taskType: task.taskType,
              title: task.title,
              description: task.description,
              priority: task.priority,
              dueDate: nextDate,
              goalId: task.goalId,
              recurrenceRule: task.recurrenceRule,
              assigneeId: task.assigneeId,
              deliverable: task.deliverable,
              estimatedMinutes: task.estimatedMinutes,
              preferredTimeStart: task.preferredTimeStart,
              preferredTimeEnd: task.preferredTimeEnd,
              processId: task.processId,
            },
          });
        } catch {
          // Invalid rule — skip recurrence silently
        }
      }

      if (task.goalId) {
        await cascadeProgressUp(task.goalId);
      }
    };
    postUpdate().catch((err) => console.warn('[tasks] post-update (recurrence/cascade) failed:', err));
  }

  // Google Calendar sync — delegate to syncTaskCalendarEvent so create paths
  // are tagged with prismRecordId (enables findExistingPrismEvent dedup and
  // prevents the duplicate-events bug where stale Task.calendarEventId values
  // produced untagged orphan events on Google's side).
  const calendarFieldsChanged = status !== undefined || timeBlockStart !== undefined || timeBlockEnd !== undefined;
  if (calendarFieldsChanged) {
    const syncCalendar = async () => {
      const { hasGoogle, calendarId: targetCalendarId } = await getGoogleSyncInfo(task.ownerId);
      if (!hasGoogle) return;
      const newStart = (data.timeBlockStart ?? task.timeBlockStart) as Date | null;
      const newEnd = (data.timeBlockEnd ?? task.timeBlockEnd) as Date | null;
      const effectiveTitle = (data.title as string | undefined) ?? task.title;
      const effectiveDescription = (data.description as string | undefined) ?? task.description ?? null;

      if ((status === 'DONE' || status === 'DROPPED') && task.calendarEventId) {
        await deleteGoogleEvent(task.ownerId, task.calendarEventId, targetCalendarId);
        await prisma.task.update({ where: { id }, data: { calendarEventId: null } });
        return;
      }

      if (status === 'DONE' || status === 'DROPPED') return;

      const action: 'create' | 'update' = task.calendarEventId ? 'update' : 'create';
      // For 'update' we only sync when time fields actually changed.
      // For 'create' we require both newStart and newEnd to be set.
      if (action === 'update' && timeBlockStart === undefined && timeBlockEnd === undefined) return;
      if (action === 'create' && (!newStart || !newEnd)) return;

      const resultEventId = await syncTaskCalendarEvent(
        task.ownerId,
        {
          id,
          calendarEventId: task.calendarEventId ?? null,
          title: effectiveTitle,
          description: effectiveDescription,
          timeBlockStart: newStart ?? null,
          timeBlockEnd: newEnd ?? null,
        },
        action,
      );

      if (resultEventId && resultEventId !== task.calendarEventId) {
        await prisma.task.update({ where: { id }, data: { calendarEventId: resultEventId } });
      }
    };
    try { await syncCalendar(); } catch (err) { console.warn('[tasks] Google Calendar sync failed:', err); }
  }

  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return notFoundResponse('Task');
  // Only owners and admins can delete (not just assignees)
  if (!hasAccess(task.ownerId, auth.userId, auth.session.user.isAdmin)) return forbiddenResponse();

  // Process-linked task: stop the recurring process so the generator can't
  // re-create the task on the next GET /api/tasks. Also sweep current-period
  // sibling tasks (ADVANCED mode creates one task per step) so the user
  // doesn't see stragglers, and delete their Google Calendar events.
  if (task.processId) {
    const process = await prisma.process.findUnique({
      where: { id: task.processId },
      select: {
        id: true,
        cadence: true,
        scheduledDayOfWeek: true,
        scheduledDayOfMonth: true,
      },
    });

    if (process) {
      const { periodStart, dueDate: periodEnd } = getCurrentPeriodRange(process);

      // Disable the process FIRST. Once durationEndDate is in the past,
      // generateTasksForCurrentPeriod() bails at its durationEndDate guard
      // before claiming the period, so concurrent regen can't race us by
      // re-creating rows between the sweep and the response.
      await prisma.process.update({
        where: { id: process.id },
        data: { durationEndDate: new Date() },
      });

      const siblings = await prisma.task.findMany({
        where: {
          processId: process.id,
          status: 'TODO',
          dueDate: { gte: periodStart, lte: periodEnd },
        },
        select: { id: true, calendarEventId: true, goalId: true },
      });

      const { calendarId: targetCalendarId } = await getGoogleSyncInfo(task.ownerId);
      for (const sib of siblings) {
        if (!sib.calendarEventId) continue;
        try {
          await deleteGoogleEvent(task.ownerId, sib.calendarEventId, targetCalendarId);
        } catch (err) {
          console.warn('[tasks] Google Calendar sync failed on process-stop delete:', err);
        }
      }

      await prisma.task.deleteMany({
        where: {
          processId: process.id,
          status: 'TODO',
          dueDate: { gte: periodStart, lte: periodEnd },
        },
      });

      // Cascade progress for any siblings that were linked to goals
      const goalIds = Array.from(new Set(siblings.map((s) => s.goalId).filter((g): g is string => !!g)));
      for (const goalId of goalIds) {
        cascadeProgressUp(goalId).catch((err) => console.warn('[tasks] cascade after process-stop delete failed:', err));
      }

      return Response.json(
        { ok: true, processStopped: true, processId: process.id },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Process row missing (shouldn't happen — falls through to the standard
    // single-task delete below so the orphan task still gets removed).
  }

  // Delete linked Google Calendar event before removing the task
  if (task.calendarEventId) {
    try {
      const { calendarId: targetCalendarId } = await getGoogleSyncInfo(task.ownerId);
      await deleteGoogleEvent(task.ownerId, task.calendarEventId, targetCalendarId);
    } catch (err) {
      console.warn('[tasks] Google Calendar sync failed on delete:', err);
    }
  }

  await prisma.task.delete({ where: { id } });

  // Cascade goal progress if linked (fire-and-forget)
  if (task.goalId) {
    cascadeProgressUp(task.goalId).catch((err) => console.warn('[tasks] cascade after delete failed:', err));
  }

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
