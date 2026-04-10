import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { parseBody, batchWinTheDaySchema } from '@/lib/schemas';
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

  const parsed = await parseBody(request, batchWinTheDaySchema);
  if ('error' in parsed) return parsed.error;
  const { taskIds, dueDate } = parsed.data;

  // Verify all tasks exist and belong to this user
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, ownerId: auth.userId },
    select: { id: true },
  });
  if (tasks.length !== taskIds.length) {
    return Response.json({ error: 'One or more tasks not found or not owned by you' }, { status: 404 });
  }

  await applyWinTheDayRanks(auth.userId, taskIds, dueDate);

  return Response.json({ ok: true, applied: taskIds.length });
}
