/**
 * Section-internal ordering: workBlock.start ASC NULLS LAST,
 * dueDate ASC NULLS LAST, priority DESC. A task with multiple
 * work blocks is keyed on its earliest block start.
 */

interface OrderableTask {
  priority?: string | null;
  dueDate?: string | Date | null;
  workBlocks?: Array<{ start: string | Date }>;
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function earliestStartMs(task: OrderableTask): number | null {
  if (!task.workBlocks || task.workBlocks.length === 0) return null;
  let earliest = Number.POSITIVE_INFINITY;
  for (const wb of task.workBlocks) {
    const ms = new Date(wb.start).getTime();
    if (!Number.isNaN(ms) && ms < earliest) earliest = ms;
  }
  return earliest === Number.POSITIVE_INFINITY ? null : earliest;
}

function dueMs(task: OrderableTask): number | null {
  if (!task.dueDate) return null;
  const ms = new Date(task.dueDate).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function compareTasksByScheduledTime(a: OrderableTask, b: OrderableTask): number {
  const aStart = earliestStartMs(a);
  const bStart = earliestStartMs(b);
  if (aStart !== bStart) {
    if (aStart === null) return 1;
    if (bStart === null) return -1;
    return aStart - bStart;
  }

  const aDue = dueMs(a);
  const bDue = dueMs(b);
  if (aDue !== bDue) {
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue - bDue;
  }

  const aPri = PRIORITY_RANK[a.priority ?? ''] ?? 0;
  const bPri = PRIORITY_RANK[b.priority ?? ''] ?? 0;
  return bPri - aPri;
}
