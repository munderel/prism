import { NextRequest } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError, requireTaskAccess } from '@/lib/auth-guard';
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
  const tzParam = searchParams.get('tz');

  const where: Record<string, unknown> = { userId: auth.userId };
  if (taskId) where.taskId = taskId;

  if (date) {
    // Compute the day window in the user's timezone — not the server's local
    // time. Falls back to the user's stored preference, then UTC. Without this
    // a Toronto user on a UTC server sees a window shifted by 4–5 hours.
    let tz = tzParam ?? undefined;
    if (!tz) {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { timezone: true },
      });
      tz = user?.timezone ?? 'UTC';
    }
    const day = fromZonedTime(`${date}T00:00:00`, tz);
    const next = fromZonedTime(`${date}T00:00:00`, tz);
    next.setUTCDate(next.getUTCDate() + 1);
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

  // Authorize via the shared helper (owner or assignee or admin).
  const taskAccess = await requireTaskAccess(taskId);
  if ('error' in taskAccess) return authError(taskAccess);

  // Schema already enforces ISO datetime + end > start + duration cap. No
  // further validation needed here.
  const startDate = new Date(start);
  const endDate = new Date(end);

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
