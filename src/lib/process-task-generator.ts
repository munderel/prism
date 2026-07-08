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
import { advisoryLock } from '@/lib/concurrency';

// ─── Period helpers ───────────────────────────────────────────────────────────

export interface PeriodRange {
  periodStart: Date;
  dueDate: Date;
}

/**
 * Compute the start and due date of the current period for a process cadence.
 * dueDate is the day within the period the process is "due" — used as the
 * task's dueDate (no timeBlockStart/End, so the task is unscheduled).
 */
export function getCurrentPeriodRange(process: {
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

  // Fast path: this runs on every GET /api/tasks and /api/calendar, so for the
  // common case where the period was already generated we skip the whole
  // transaction + advisory lock. The findUnique above already loaded lastRunAt,
  // so this costs nothing extra. The in-transaction re-check below stays the
  // AUTHORITATIVE claim — it re-reads lastRunAt under the lock, so a race that
  // slips past this stale-read gate is still resolved correctly.
  if (process.lastRunAt && process.lastRunAt >= periodStart) return;

  // Serialize per-process AND keep the period-claim atomic with the creates.
  // checkAndCreateDueProcessTasks() runs on every GET /api/tasks and
  // /api/calendar, so concurrent SWR fetches can race here. The advisory lock
  // serializes them; advancing lastRunAt only AFTER a successful create (inside
  // the same transaction) means a transient create failure ROLLS BACK the claim
  // so the next call retries — the old code advanced lastRunAt first, so any
  // create failure silently skipped the whole period forever.
  await advisoryLock(`process-gen:${processId}`, async (tx) => {
    const claim = await tx.process.findUnique({
      where: { id: processId },
      select: { lastRunAt: true },
    });
    // Already created (and committed) for this period.
    if (claim?.lastRunAt && claim.lastRunAt >= periodStart) return;

    if (process.mode === 'BASIC') {
      if (!process.scheduledTime) return;

      const existing = await tx.task.count({
        where: {
          processId,
          status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
          dueDate: { gte: periodStart, lte: dueDate },
        },
      });

      if (existing === 0) {
        // Compute time blocks in the user's timezone
        const user = await tx.user.findUnique({
          where: { id: ownerId },
          select: { timezone: true },
        });
        const userTz = user?.timezone ?? 'America/New_York';
        const [hours, minutes] = process.scheduledTime.split(':').map(Number);
        const zonedDue = toZonedTime(dueDate, userTz);
        const dateKey = `${zonedDue.getFullYear()}-${pad2(zonedDue.getMonth() + 1)}-${pad2(zonedDue.getDate())}`;
        const timeBlockStart = fromZonedTime(`${dateKey}T${pad2(hours)}:${pad2(minutes)}:00`, userTz);
        const timeBlockEnd = new Date(timeBlockStart.getTime() + (process.defaultDurationMinutes ?? 60) * 60_000);

        await tx.task.create({
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
      }

      await tx.process.update({ where: { id: processId }, data: { lastRunAt: new Date() } });
      return;
    }

    // ADVANCED mode — one task per step (independent), or one task if no steps.
    const existing = await tx.task.count({
      where: {
        processId,
        status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
        dueDate: { gte: periodStart, lte: dueDate },
      },
    });

    if (existing === 0) {
      if (process.steps.length === 0) {
        await tx.task.create({
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
        // createMany in a single statement (avoids parallel queries on the tx
        // client); skipDuplicates leans on the partial unique index on
        // (processId, dueDate, title) so a retry can't double-insert.
        await tx.task.createMany({
          data: process.steps.map((step) => ({
            ownerId,
            taskType: 'MAINTENANCE' as const,
            title: step.title,
            description: step.description,
            dueDate,
            status: 'TODO' as const,
            priority: 'MEDIUM' as const,
            estimatedMinutes: process.defaultDurationMinutes,
            processId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Advance the claim only after a successful create — atomic with the writes.
    await tx.process.update({ where: { id: processId }, data: { lastRunAt: new Date() } });
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
  // Releases the period claim so the next GET regenerates tasks. Without
  // this, generateTasksForCurrentPeriod's atomic claim would block until
  // the next period boundary.
  await prisma.process.update({
    where: { id: processId },
    data: { lastRunAt: null },
  });
}
