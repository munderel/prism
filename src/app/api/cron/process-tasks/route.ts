import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronSecret } from '@/lib/auth-guard';
import { computeNextDueDate } from '@/lib/process-scheduler';

// Vercel crons only invoke GET, so export GET as the handler
export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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

    const results = await Promise.all(
      dueProcesses.map(async (process) => {
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
          return { processId: process.id, skipped: true, reason: 'no responsible user' };
        }

        // Idempotency guard: skip if we already created an execution for this process today
        const existingExecution = await prisma.processExecution.findFirst({
          where: {
            processId: process.id,
            scheduledDate: { gte: today },
          },
        });
        if (existingExecution) {
          return { processId: process.id, skipped: true, reason: 'already executed today' };
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
              estimatedMinutes: process.defaultDurationMinutes,
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

        return { processId: process.id, taskId: task.id, executionId: execution.id };
      })
    );

    return Response.json({ processed: results.length, results });
  } catch (error) {
    console.error('[cron/process-tasks] Unhandled error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
