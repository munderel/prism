import { prisma } from '@/lib/prisma';
import { generateTasksForCurrentPeriod } from '@/lib/process-task-generator';

// Per-instance memo: this sweep runs on every GET /api/tasks and
// /api/calendar, but nothing new becomes due within a few seconds. Skip the
// findMany + per-process work when a sweep completed within the window. This
// is per warm-lambda only and safe because the generator stays idempotent —
// the memo merely thins duplicate sweeps, it is not a correctness gate.
let lastSweepAt = 0;
const SWEEP_MEMO_MS = 30_000;

/** Reset the sweep memo — test hook only. */
export function _resetSweepMemo(): void {
  lastSweepAt = 0;
}

/**
 * For each ADVANCED process, lazily create tasks for the current period if
 * none exist yet. Called on every GET /api/tasks — idempotent. Expired
 * processes are skipped by the generator itself.
 */
export async function checkAndCreateDueProcessTasks(): Promise<void> {
  if (Date.now() - lastSweepAt < SWEEP_MEMO_MS) return;

  const processes = await prisma.process.findMany({
    where: {
      OR: [
        { mode: 'ADVANCED' },
        { mode: 'BASIC', scheduledTime: { not: null } },
      ],
    },
    select: { id: true },
  });

  if (processes.length === 0) {
    // Still mark the window: an empty process set is a completed sweep.
    lastSweepAt = Date.now();
    return;
  }

  await Promise.all(processes.map((p) => generateTasksForCurrentPeriod(p.id)));
  lastSweepAt = Date.now();
}
