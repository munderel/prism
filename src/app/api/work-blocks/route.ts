import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createWorkBlockSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const taskId = searchParams.get('taskId');
  const date = searchParams.get('date'); // YYYY-MM-DD — convenience for powerdown "today"

  const where: Record<string, unknown> = { userId: auth.userId };
  if (taskId) where.taskId = taskId;

  if (date) {
    const day = new Date(`${date}T00:00:00`);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    where.start = { gte: day, lt: next };
  } else if (start && end) {
    where.start = { gte: new Date(start), lt: new Date(end) };
  }

  const blocks = await prisma.workBlock.findMany({
    where,
    orderBy: { start: 'asc' },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return Response.json(blocks, NO_STORE);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createWorkBlockSchema);
  if ('error' in parsed) return parsed.error;
  const { taskId, start, end, mainObjective, subGoals } = parsed.data;

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [{ ownerId: auth.userId }, { assigneeId: auth.userId }],
    },
    select: { id: true },
  });
  if (!task) {
    return Response.json({ error: 'Task not found or not accessible' }, { status: 404 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return Response.json({ error: 'Invalid start/end' }, { status: 400 });
  }

  const block = await prisma.workBlock.create({
    data: {
      taskId,
      userId: auth.userId,
      start: startDate,
      end: endDate,
      mainObjective: mainObjective.trim(),
    },
  });

  if (subGoals && subGoals.length > 0) {
    // Determine starting sortOrder to append after any existing task-level clear goals
    const maxOrder = await prisma.clearGoal.aggregate({
      where: { taskId },
      _max: { sortOrder: true },
    });
    const baseOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    await prisma.clearGoal.createMany({
      data: subGoals.map((text, idx) => ({
        taskId,
        workBlockId: block.id,
        text: text.trim(),
        sortOrder: baseOrder + idx,
      })),
    });
  }

  const full = await prisma.workBlock.findUnique({
    where: { id: block.id },
    include: {
      task: { select: { id: true, title: true, taskType: true, priority: true, estimatedMinutes: true, status: true, dueDate: true } },
      clearGoals: { orderBy: { sortOrder: 'asc' } },
    },
  });

  return Response.json(full, { status: 201, ...NO_STORE });
}
