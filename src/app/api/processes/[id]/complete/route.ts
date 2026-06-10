import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { notFoundResponse, forbiddenResponse, canAccessProcess, NO_STORE } from '@/lib/api-helpers';
import { parseBody, completeProcessSchema } from '@/lib/schemas';
import { updateSpecificStreak } from '@/lib/streak-engine';
import { advisoryLock } from '@/lib/concurrency';

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

  // Serialize the read-decide-write per (process, day) so a double-click or two
  // concurrent clients can't both pass the findFirst check and insert duplicate
  // ProcessExecution rows (which would double-count streaks/history).
  const outcome = await advisoryLock(`process-complete:${id}:${date.toISOString()}`, async (tx) => {
    const existing = await tx.processExecution.findFirst({
      where: { processId: id, scheduledDate: { gte: date, lt: nextDay } },
    });

    if (existing) {
      // Toggle: if already completed, un-complete; if not, complete.
      if (existing.completedAt) {
        const updated = await tx.processExecution.update({
          where: { id: existing.id },
          data: { completedAt: null },
        });
        return { execution: updated, completed: false, created: false, fireStreak: false };
      }
      const updated = await tx.processExecution.update({
        where: { id: existing.id },
        data: { completedAt: new Date() },
      });
      return { execution: updated, completed: true, created: false, fireStreak: true };
    }

    const execution = await tx.processExecution.create({
      data: { processId: id, executedById: auth.userId, scheduledDate: date, completedAt: new Date() },
    });
    await tx.process.update({ where: { id }, data: { lastRunAt: new Date() } });
    return { execution, completed: true, created: true, fireStreak: true };
  });

  // Per-process streak (outside the lock — the streak engine uses the singleton
  // client and would otherwise contend with the open advisory transaction).
  // Daily streak is driven solely by powerdown.
  if (outcome.fireStreak) {
    await updateSpecificStreak(auth.userId, `process_${id}`, process.cadence).catch((err) =>
      console.warn('[streak] process streak update failed:', err),
    );
  }

  return Response.json(
    { execution: outcome.execution, completed: outcome.completed },
    outcome.created ? { status: 201, ...NO_STORE } : NO_STORE,
  );
}
