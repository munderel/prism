/**
 * Shared helpers for building aim history and computing expected-per-day.
 *
 * Used by /api/aims/history and /api/aims/derail-batch to avoid duplication.
 */

import { getEffectiveFrequency, type UserAimLike } from '@/lib/aim-phases';

export interface HistoryEntry {
  date: string;
  completed: boolean;
  status: string;
}

interface InstanceLike {
  scheduledDate: Date | string;
  status: string;
  completedAt?: Date | string | null;
}

/**
 * Build day-by-day history entries from a list of instances over a date range.
 */
export function buildDailyHistory(
  instances: InstanceLike[],
  startDate: Date,
  endDate: Date,
): HistoryEntry[] {
  const completedDates = new Set<string>();
  const instancesByDate = new Map<string, { status: string }>();

  for (const inst of instances) {
    const dateKey = new Date(inst.scheduledDate).toISOString().split('T')[0];
    instancesByDate.set(dateKey, { status: inst.status });
    if (inst.status === 'COMPLETED' || inst.completedAt) {
      completedDates.add(dateKey);
    }
  }

  const history: HistoryEntry[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateKey = cursor.toISOString().split('T')[0];
    const inst = instancesByDate.get(dateKey);
    history.push({
      date: dateKey,
      completed: completedDates.has(dateKey),
      status: inst?.status ?? 'NONE',
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return history;
}

/**
 * Compute expected completions per day for a UserAim, accounting for phase.
 */
export function computeExpectedPerDay(
  userAim: UserAimLike & { aimCategory: { isDaily: boolean } },
): number {
  if (userAim.aimCategory.isDaily) return 1;
  return getEffectiveFrequency(userAim) / 7;
}

/**
 * Build a date range from today minus `days` to end-of-today.
 */
export function buildDateRange(days: number): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}
