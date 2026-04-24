import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, canAccessProcess, NO_STORE } from '@/lib/api-helpers';
import { parseBody, completeProcessSchema } from '@/lib/schemas';
import { updateSpecificStreak } from '@/lib/streak-engine';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await parseBody(request, completeProcessSchema);
  if ('error' in parsed) return parsed.error;
  const { scheduledDate } = parsed.data;

  const process = await prisma.process.findUnique({
    where: { id },
    select: {
      id: true,
      assigneeId: true,
      delegateId: true,
      delegateUntil: true,
      cadence: true,
    },
  });

  if (!process) return notFoundResponse('Process');

  if (!canAccessProcess(process, auth.userId, auth.session.user.isAdmin)) {
    return forbiddenResponse();
  }

  // Normalize to start of day for idempotency check
  const date = new Date(scheduledDate);
  date.setHours(0, 0, 0, 0);
  const nextDay = new Date(date.getTime() + 86400000);

  // Check for existing execution on this date
  const existing = await prisma.processExecution.findFirst({
    where: {
      processId: id,
      scheduledDate: { gte: date, lt: nextDay },
    },
  });

  if (existing) {
    // Toggle: if already completed, un-complete; if not, complete
    if (existing.completedAt) {
      const updated = await prisma.processExecution.update({
        where: { id: existing.id },
        data: { completedAt: null },
      });
      return Response.json({ execution: updated, completed: false }, NO_STORE);
    } else {
      const updated = await prisma.processExecution.update({
        where: { id: existing.id },
        data: { completedAt: new Date() },
      });

      // Per-process streak. Daily streak is driven solely by powerdown.
      await updateSpecificStreak(auth.userId, `process_${id}`, process.cadence).catch((err) => console.warn('[streak] process streak update failed:', err));

      return Response.json({ execution: updated, completed: true }, NO_STORE);
    }
  }

  // Create new execution marked as complete
  const execution = await prisma.processExecution.create({
    data: {
      processId: id,
      executedById: auth.userId,
      scheduledDate: date,
      completedAt: new Date(),
    },
  });

  // Update process lastRunAt
  await prisma.process.update({
    where: { id },
    data: { lastRunAt: new Date() },
  });

  // Per-process streak. Daily streak is driven solely by powerdown.
  await updateSpecificStreak(auth.userId, `process_${id}`, process.cadence).catch((err) => console.warn('[streak] process streak update failed:', err));

  return Response.json({ execution, completed: true }, { status: 201, ...NO_STORE });
}
