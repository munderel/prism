import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import { safeParseJson, notFoundResponse, NO_STORE } from '@/lib/api-helpers';
import { updateProcessStreak } from '@/lib/process-streak';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { id } = await params;

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { scheduledDate } = parsed.data;

  if (!scheduledDate) {
    return Response.json({ error: 'scheduledDate is required' }, { status: 400 });
  }

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

  // Verify user is assignee or delegate
  const isAdmin = auth.session.user.isAdmin;
  const today = new Date();
  const hasDelegation =
    process.delegateId &&
    process.delegateUntil &&
    process.delegateUntil >= today;
  const isAuthorized =
    isAdmin ||
    process.assigneeId === auth.userId ||
    (hasDelegation && process.delegateId === auth.userId);

  if (!isAuthorized) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
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

      // Update streak (fire-and-forget)
      updateProcessStreak(auth.userId, id, process.cadence).catch(() => {});

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

  // Update streak (fire-and-forget)
  updateProcessStreak(auth.userId, id, process.cadence).catch(() => {});

  return Response.json({ execution, completed: true }, { status: 201, ...NO_STORE });
}
