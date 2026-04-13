import { ProcessCadence } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  startOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  setDay,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { pad2 } from '@/lib/google-sync-state';
import { resolveAssignee } from '@/lib/delegation';

// ─── Period helpers ───────────────────────────────────────────────────────────

interface PeriodRange {
  periodStart: Date;
  dueDate: Date;
}

/**
 * Compute the start and due date of the current period for a process cadence.
 * dueDate is the day within the period the process is "due" — used as the
 * task's dueDate (no timeBlockStart/End, so the task is unscheduled).
 */
function getCurrentPeriodRange(process: {
  cadence: ProcessCadence;
  scheduledDayOfWeek: number | null;
  scheduledDayOfMonth: number | null;
}): PeriodRange {
  const now = new Date();

  switch (process.cadence) {
    case 'DAILY': {
      const periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
      const dueDate = new Date(now);
      dueDate.setHours(23, 59, 59, 999);
      return { periodStart, dueDate };
    }

    case 'WEEKLY':
    case 'BIWEEKLY': {
      // Period starts on Monday of the current week
      const periodStart = startOfWeek(now, { weekStartsOn: 1 });

      // For BIWEEKLY: period is 2 weeks, but we still use the current week's Monday as start
      // dueDate = scheduledDayOfWeek within this week (0=Sun…6=Sat), default Sunday (0)
      const targetDow = process.scheduledDayOfWeek ?? 0; // 0=Sun
      // setDay with weekStartsOn:1 returns the date within Mon–Sun for targetDow.
      // DOW=0 (Sunday) returns Mon+6 days, which is the last day of the ISO week.
      const dueDate = setDay(periodStart, targetDow, { weekStartsOn: 1 });
      dueDate.setHours(23, 59, 59, 999);
      return { periodStart, dueDate };
    }

    case 'MONTHLY': {
      const periodStart = startOfMonth(now);
      const targetDay = process.scheduledDayOfMonth ?? 1;
      const dueDate = new Date(now.getFullYear(), now.getMonth(), targetDay, 23, 59, 59, 999);
      // Clamp to end of month if day exceeds month length
      const eom = endOfMonth(now);
      return { periodStart, dueDate: dueDate > eom ? eom : dueDate };
    }

    case 'QUARTERLY': {
      const periodStart = startOfQuarter(now);
      const targetDay = process.scheduledDayOfMonth ?? 1;
      const dueDate = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth(),
        targetDay,
        23, 59, 59, 999
      );
      const eoq = endOfQuarter(now);
      return { periodStart, dueDate: dueDate > eoq ? eoq : dueDate };
    }

    case 'YEARLY': {
      const periodStart = startOfYear(now);
      const targetDay = process.scheduledDayOfMonth ?? 1;
      const dueDate = new Date(now.getFullYear(), 0, targetDay, 23, 59, 59, 999);
      const eoy = endOfYear(now);
      return { periodStart, dueDate: dueDate > eoy ? eoy : dueDate };
    }

    case 'ONE_TIME':
    default: {
      // For ONE_TIME: due today
      const periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
      const dueDate = new Date(now);
      dueDate.setHours(23, 59, 59, 999);
      return { periodStart, dueDate };
    }
  }
}

// ─── Owner resolution ─────────────────────────────────────────────────────────

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Lazily create MAINTENANCE tasks for the current period of an ADVANCED process.
 * Idempotent — if tasks already exist for this period, returns immediately.
 * No parent/child hierarchy: each step becomes an independent task.
 */
export async function generateTasksForCurrentPeriod(processId: string): Promise<void> {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      steps: { orderBy: { sortOrder: 'asc' } },
      function: { select: { id: true } },
    },
  });

  if (!process) return;
  if (process.mode !== 'ADVANCED' && process.mode !== 'BASIC') return;

  // Respect duration end date
  if (process.durationEndDate && new Date() > process.durationEndDate) return;

  const ownerId = resolveAssignee(process);
  if (!ownerId) return; // No responsible user — skip

  const { periodStart, dueDate } = getCurrentPeriodRange(process);

  // BASIC mode: create a single task for the current period with time blocks
  if (process.mode === 'BASIC') {
    if (!process.scheduledTime) return;

    const existing = await prisma.task.count({
      where: {
        processId,
        status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
        dueDate: { gte: periodStart, lte: dueDate },
      },
    });
    if (existing > 0) return;

    // Compute time blocks in user's timezone
    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true },
    });
    const userTz = user?.timezone ?? 'America/New_York';
    const [hours, minutes] = process.scheduledTime.split(':').map(Number);
    const zonedDue = toZonedTime(dueDate, userTz);
    const dateKey = `${zonedDue.getFullYear()}-${pad2(zonedDue.getMonth() + 1)}-${pad2(zonedDue.getDate())}`;
    const timeBlockStart = fromZonedTime(`${dateKey}T${pad2(hours)}:${pad2(minutes)}:00`, userTz);
    const timeBlockEnd = new Date(timeBlockStart.getTime() + (process.defaultDurationMinutes ?? 60) * 60_000);

    await prisma.task.create({
      data: {
        ownerId,
        taskType: 'MAINTENANCE',
        title: process.title,
        description: process.description,
        dueDate,
        timeBlockStart,
        timeBlockEnd,
        status: 'TODO',
        priority: 'MEDIUM',
        estimatedMinutes: process.defaultDurationMinutes,
        processId,
      },
    });

    await prisma.process.update({
      where: { id: processId },
      data: { lastRunAt: new Date() },
    });
    return;
  }

  // Idempotency: check if any tasks exist for this process in the current period
  const existing = await prisma.task.count({
    where: {
      processId,
      status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
      dueDate: { gte: periodStart, lte: dueDate },
    },
  });
  if (existing > 0) return;

  // Create tasks: one per step (independent), or one parent task if no steps
  if (process.steps.length === 0) {
    await prisma.task.create({
      data: {
        ownerId,
        taskType: 'MAINTENANCE',
        title: process.title,
        description: process.description,
        dueDate,
        status: 'TODO',
        priority: 'MEDIUM',
        estimatedMinutes: process.defaultDurationMinutes,
        processId,
      },
    });
  } else {
    await Promise.all(
      process.steps.map((step) =>
        prisma.task.create({
          data: {
            ownerId,
            taskType: 'MAINTENANCE',
            title: step.title,
            description: step.description,
            dueDate,
            status: 'TODO',
            priority: 'MEDIUM',
            estimatedMinutes: process.defaultDurationMinutes,
            processId,
          },
        })
      )
    );
  }

  await prisma.process.update({
    where: { id: processId },
    data: { lastRunAt: new Date() },
  });
}

// ─── Period start helper (for route invalidation) ─────────────────────────────

/**
 * Returns the start of the current period for a given cadence.
 * Used by step routes to delete stale TODO tasks so the checker recreates them.
 */
export function getCurrentPeriodStart(cadence: ProcessCadence): Date {
  const now = new Date();
  switch (cadence) {
    case 'DAILY': {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
    case 'WEEKLY':
    case 'BIWEEKLY':
      return startOfWeek(now, { weekStartsOn: 1 });
    case 'MONTHLY':
      return startOfMonth(now);
    case 'QUARTERLY':
      return startOfQuarter(now);
    case 'YEARLY':
      return startOfYear(now);
    default: {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
  }
}

// ─── Period invalidation (called by step/process routes) ─────────────────────

/**
 * Delete TODO tasks in the current period for a process so the checker
 * recreates them fresh on the next GET /api/tasks call.
 * Called from step add/edit/delete and process mode/cadence/assignee changes.
 */
export async function cleanupCurrentPeriodTasks(processId: string, cadence: ProcessCadence): Promise<void> {
  const { periodStart, dueDate: periodEnd } = getCurrentPeriodRange({ cadence, scheduledDayOfWeek: null, scheduledDayOfMonth: null });
  await prisma.task.deleteMany({
    where: {
      processId,
      status: 'TODO',
      dueDate: { gte: periodStart, lte: periodEnd },
    },
  });
}
