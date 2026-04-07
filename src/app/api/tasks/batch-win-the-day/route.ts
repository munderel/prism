import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { applyWinTheDayRanks } from '@/lib/task-helpers';

/**
 * POST /api/tasks/batch-win-the-day
 *
 * Sets isWinTheDay=true and winTheDayRank=1/2/3 on the given tasks atomically.
 * If dueDate is provided, clears existing WTD flags on that date first.
 *
 * Body: { taskIds: string[], dueDate?: string }
 * - taskIds: ordered array (index 0 = rank 1). Max 3 items.
 * - dueDate: optional ISO date string for the target day. Used to unflag
 *   competing tasks on that date (e.g. tomorrow from powerdown).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { taskIds, dueDate } = parsed.data as { taskIds?: unknown; dueDate?: unknown };

  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 3) {
    return Response.json({ error: 'taskIds must be an array of 1–3 task IDs' }, { status: 400 });
  }
  if (dueDate !== undefined && (typeof dueDate !== 'string' || isNaN(new Date(dueDate).getTime()))) {
    return Response.json({ error: 'dueDate must be a valid ISO date string' }, { status: 400 });
  }

  // Verify all tasks exist and belong to this user
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds as string[] }, ownerId: auth.userId },
    select: { id: true },
  });
  if (tasks.length !== taskIds.length) {
    return Response.json({ error: 'One or more tasks not found or not owned by you' }, { status: 404 });
  }

  await applyWinTheDayRanks(auth.userId, taskIds as string[], dueDate as string | undefined);

  return Response.json({ ok: true, applied: taskIds.length });
}
