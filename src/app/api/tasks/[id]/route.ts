import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { pickDefined, notFoundResponse, hasAccess, forbiddenResponse, USER_SUMMARY_SELECT } from '@/lib/api-helpers';
import { parseBody, updateTaskSchema } from '@/lib/schemas';
import { cascadeProgressUp } from '@/lib/progress';
import { parseRRule, getNextOccurrence } from '@/lib/recurrence';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, hasGoogleAccount } from '@/lib/calendar';
import { unflagOtherWinTheDay } from '@/lib/task-helpers';

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
      goal: { select: { id: true, title: true, level: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: USER_SUMMARY_SELECT },
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
      },
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

  const data: any = pickDefined(body, [
    'title', 'description', 'priority', 'deliverable', 'estimatedMinutes',
    'preferredTimeStart', 'preferredTimeEnd', 'isPinned', 'isAutoScheduled', 'isWinTheDay',
  ]);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;

  if (isWinTheDay === true && task.dueDate) {
    await unflagOtherWinTheDay(task.ownerId, task.dueDate, id);
  }

  // Status transitions
  if (status !== undefined) {
    data.status = status;

    if (status === 'IN_PROGRESS' && !task.startedAt) {
      data.startedAt = new Date();
    }

    if (status === 'DONE') {
      data.completedAt = new Date();
    }

    if (status === 'DROPPED') {
      data.failedAt = new Date();
    }
  }

  const updated = await prisma.task.update({ where: { id }, data });

  // On completion or drop: handle recurrence + progress cascade (fast DB ops — keep synchronous)
  if (status === 'DONE' || status === 'DROPPED') {
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
          },
        });
      } catch {
        // Invalid rule — skip recurrence silently
      }
    }

    if (task.goalId) {
      await cascadeProgressUp(task.goalId);
    }
  }

  // Google Calendar sync — fire-and-forget (external API calls can be slow)
  const calendarFieldsChanged = status !== undefined || timeBlockStart !== undefined || timeBlockEnd !== undefined;
  if (calendarFieldsChanged) {
    const syncCalendar = async () => {
      const hasGoogle = await hasGoogleAccount(task.ownerId);
      if (!hasGoogle) return;
      const newStart = data.timeBlockStart ?? task.timeBlockStart;
      const newEnd = data.timeBlockEnd ?? task.timeBlockEnd;

      if ((status === 'DONE' || status === 'DROPPED') && task.calendarEventId) {
        await deleteGoogleEvent(task.ownerId, task.calendarEventId);
        await prisma.task.update({ where: { id }, data: { calendarEventId: null } });
      } else if (task.calendarEventId && (timeBlockStart !== undefined || timeBlockEnd !== undefined)) {
        await updateGoogleEvent(task.ownerId, task.calendarEventId, {
          summary: data.title ?? task.title,
          description: data.description ?? task.description ?? undefined,
          start: newStart ? new Date(newStart).toISOString() : undefined,
          end: newEnd ? new Date(newEnd).toISOString() : undefined,
        });
      } else if (!task.calendarEventId && newStart && newEnd && status !== 'DONE' && status !== 'DROPPED') {
        const gcalEvent = await createGoogleEvent(task.ownerId, {
          summary: data.title ?? task.title,
          description: data.description ?? task.description ?? undefined,
          start: new Date(newStart).toISOString(),
          end: new Date(newEnd).toISOString(),
        });
        if (gcalEvent?.id) {
          await prisma.task.update({ where: { id }, data: { calendarEventId: gcalEvent.id } });
        }
      }
    };
    syncCalendar().catch((err) => console.warn('[tasks] Google Calendar sync failed:', err));
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

  // Delete linked Google Calendar event before removing the task
  if (task.calendarEventId) {
    try {
      await deleteGoogleEvent(task.ownerId, task.calendarEventId);
    } catch (err) {
      console.warn('[tasks] Google Calendar sync failed on delete:', err);
    }
  }

  await prisma.task.delete({ where: { id } });

  // Cascade goal progress if linked
  if (task.goalId) {
    await cascadeProgressUp(task.goalId);
  }

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
