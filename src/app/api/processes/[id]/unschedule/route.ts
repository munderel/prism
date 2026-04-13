import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseLocalDateKey } from '@/lib/google-sync-state';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;
  const body = await request.json();
  const { scheduledDate } = body;

  if (!scheduledDate) {
    return Response.json({ error: 'scheduledDate is required' }, { status: 400 });
  }

  const process = await prisma.process.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true,
      assigneeId: true, delegateId: true, delegateUntil: true,
      defaultDurationMinutes: true,
    },
  });
  if (!process) {
    return Response.json({ error: 'Process not found' }, { status: 404 });
  }

  // Resolve the responsible user
  const today = new Date();
  let ownerId: string;
  if (process.delegateId && process.delegateUntil && process.delegateUntil >= today) {
    ownerId = process.delegateId;
  } else if (process.assigneeId) {
    ownerId = process.assigneeId;
  } else {
    ownerId = auth.userId;
  }

  const owner = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { timezone: true },
  });
  const userTz = owner?.timezone ?? 'America/New_York';
  const date = parseLocalDateKey(scheduledDate, userTz);
  const nextDay = new Date(date.getTime() + 86400000);

  // Find or create ProcessExecution
  let execution = await prisma.processExecution.findFirst({
    where: {
      processId: id,
      scheduledDate: { gte: date, lt: nextDay },
    },
  });

  if (!execution) {
    execution = await prisma.processExecution.create({
      data: {
        processId: id,
        executedById: auth.userId,
        scheduledDate: date,
      },
    });
  }

  // Find or create linked Task
  let task = execution.taskId
    ? await prisma.task.findUnique({ where: { id: execution.taskId } })
    : null;

  if (!task) {
    const dueDate = new Date(date);
    dueDate.setHours(23, 59, 59, 999);

    task = await prisma.task.create({
      data: {
        ownerId,
        taskType: 'MAINTENANCE',
        title: process.title,
        description: process.description,
        dueDate,
        status: 'TODO',
        priority: 'MEDIUM',
        estimatedMinutes: process.defaultDurationMinutes,
        processId: id,
        timeBlockStart: null,
        timeBlockEnd: null,
      },
    });
  } else {
    task = await prisma.task.update({
      where: { id: task.id },
      data: { timeBlockStart: null, timeBlockEnd: null },
    });
  }

  // Mark execution as unscheduled and link to task
  const updated = await prisma.processExecution.update({
    where: { id: execution.id },
    data: {
      unscheduledAt: new Date(),
      timeBlockStart: null,
      timeBlockEnd: null,
      taskId: task.id,
    },
  });

  return Response.json({ execution: updated, task }, NO_STORE);
}
