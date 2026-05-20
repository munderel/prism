/**
 * Section-internal ordering: workBlock.start ASC NULLS LAST,
 * dueDate ASC NULLS LAST, priority DESC. A task with multiple
 * work blocks is keyed on its earliest block start.
 *
 * Inputs accept either full ISO strings or Date objects for time fields.
 * Bare YYYY-MM-DD dueDate values are anchored to UTC midnight by `new Date`
 * (matching the convention in `src/lib/date-utils.ts`); callers shouldn't
 * need to pre-normalize.
 */

import { PRIORITY_RANK, type TaskPriority } from '@/lib/task-priority';

interface OrderableTask {
  // Tightened from `string | null` to the TaskPriority union so a typo
  // ('High' lower-cased) fails at compile time instead of silently ranking 0.
  priority?: TaskPriority | null;
  dueDate?: string | Date | null;
  workBlocks?: Array<{ start: string | Date }>;
}

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

  const aPri = a.priority ? PRIORITY_RANK[a.priority] : 0;
  const bPri = b.priority ? PRIORITY_RANK[b.priority] : 0;
  return bPri - aPri;
}

/**
 * In-place sort every bucket of a `{ [key]: Task[] }` map by scheduled time.
 * Use this after a date-grouped fan-out so each day's list is consistently
 * ordered. Mutates each bucket array; returns the same map for chaining.
 */
export function sortBucketsByScheduledTime<T extends OrderableTask>(
  groups: Record<string, T[]>,
): Record<string, T[]> {
  for (const key of Object.keys(groups)) {
    groups[key].sort(compareTasksByScheduledTime);
  }
  return groups;
}
