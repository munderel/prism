/**
 * Shared TaskPriority union + rank map.
 *
 * The same value lived in two places (scheduling-engine.ts and
 * task-ordering.ts); a new enum value would have needed a coordinated
 * update or the comparators would silently fall back to 0 (LOW-ranked).
 * Centralizing here makes adding a value a single-file change.
 *
 * The string union is intentionally kept in sync with the Prisma
 * `TaskPriority` enum — both files used to spell it inline.
 */
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
