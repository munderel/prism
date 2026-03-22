import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { cascadeProgressUp } from '@/lib/progress';
import { parseRRule, getNextOccurrence } from '@/lib/recurrence';

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
          author: { select: { id: true, name: true, image: true } },
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!task) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  if (!task) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, status, priority, dueDate, timeBlockStart, timeBlockEnd } = body;

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (timeBlockStart !== undefined) data.timeBlockStart = timeBlockStart ? new Date(timeBlockStart) : null;
  if (timeBlockEnd !== undefined) data.timeBlockEnd = timeBlockEnd ? new Date(timeBlockEnd) : null;

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

  // On completion or drop: handle recurrence + progress cascade
  if (status === 'DONE' || status === 'DROPPED') {
    // Create next recurring task if applicable
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

    // Cascade goal progress
    if (task.goalId) {
      await cascadeProgressUp(task.goalId);
    }
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.ownerId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });

  // Cascade goal progress if linked
  if (task.goalId) {
    await cascadeProgressUp(task.goalId);
  }

  return Response.json({ ok: true });
}
