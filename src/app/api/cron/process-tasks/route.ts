import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronSecret } from '@/lib/auth-guard';
import { computeNextDueDate } from '@/lib/process-scheduler';

export async function POST(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dueProcesses = await prisma.process.findMany({
    where: {
      nextDueAt: { lte: now },
    },
    include: {
      assignee: { select: { id: true } },
      delegate: { select: { id: true } },
    },
  });

  const results = [];

  for (const process of dueProcesses) {
    // Determine responsible user
    let responsibleUserId: string | null = null;

    if (
      process.delegateId &&
      process.delegateUntil &&
      process.delegateUntil >= today
    ) {
      responsibleUserId = process.delegateId;
    } else if (process.assigneeId) {
      responsibleUserId = process.assigneeId;
    }

    if (!responsibleUserId) {
      results.push({ processId: process.id, skipped: true, reason: 'no responsible user' });
      continue;
    }

    // Create task and execution in a transaction
    const { task, execution } = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          ownerId: responsibleUserId!,
          taskType: 'MAINTENANCE',
          title: process.title,
          description: process.description,
          dueDate: computeNextDueDate(process.cadence, now),
          status: 'TODO',
          priority: 'MEDIUM',
        },
      });

      const execution = await tx.processExecution.create({
        data: {
          processId: process.id,
          executedById: responsibleUserId,
          scheduledDate: now,
          taskId: task.id,
        },
      });

      await tx.process.update({
        where: { id: process.id },
        data: {
          lastRunAt: now,
          nextDueAt: computeNextDueDate(process.cadence, now),
        },
      });

      return { task, execution };
    });

    results.push({ processId: process.id, taskId: task.id, executionId: execution.id });
  }

  return Response.json({ processed: results.length, results });
}
