import { KpiTimeLevel } from '@prisma/client';
import {
  DateBoundary,
  LabeledDateBoundary,
  getWeekBoundaries,
  getMonthBoundaries,
  getYearBoundaries,
  getWeeksInMonth,
  getMonthsInYear,
  parseLocalDate,
  toLocalDateKey,
} from './date-utils';

/**
 * Returns the start/end date range for a given time level.
 * WEEKLY  → Mon–Sun of the week containing referenceDate
 * MONTHLY → 1st–last of the month containing referenceDate
 * YEARLY / FIVE_YEAR / HHG → Jan 1 – Dec 31 of the year containing referenceDate
 */
export function getDateRangeForTimeLevel(
  timeLevel: KpiTimeLevel,
  referenceDate?: Date,
): DateBoundary {
  switch (timeLevel) {
    case KpiTimeLevel.WEEKLY:
      return getWeekBoundaries(referenceDate);
    case KpiTimeLevel.MONTHLY:
      return getMonthBoundaries(referenceDate);
    case KpiTimeLevel.YEARLY:
    case KpiTimeLevel.FIVE_YEAR:
    case KpiTimeLevel.HHG:
    default:
      return getYearBoundaries(referenceDate);
  }
}

/**
 * Returns sub-period boundaries for a time level within the given date range.
 * MONTHLY → weeks within the month (derived from startDate)
 * YEARLY  → months within the year (derived from startDate)
 * WEEKLY / FIVE_YEAR / HHG → empty array (no meaningful sub-periods)
 */
export function getSubPeriodBoundaries(
  timeLevel: KpiTimeLevel,
  startDate: string,
  _endDate: string,
): LabeledDateBoundary[] {
  const start = parseLocalDate(startDate);

  switch (timeLevel) {
    case KpiTimeLevel.MONTHLY: {
      const year = start.getFullYear();
      const month = start.getMonth() + 1; // 1-based
      return getWeeksInMonth(year, month);
    }
    case KpiTimeLevel.YEARLY: {
      const year = start.getFullYear();
      return getMonthsInYear(year);
    }
    case KpiTimeLevel.WEEKLY:
    case KpiTimeLevel.FIVE_YEAR:
    case KpiTimeLevel.HHG:
    default:
      return [];
  }
}

/**
 * Sums entry values into buckets defined by boundaries.
 *
 * Each entry's date is compared against each boundary's start/end range
 * (inclusive on both ends). An entry may fall into multiple buckets if
 * boundaries overlap, but standard generated boundaries never overlap.
 *
 * Returns an array parallel to `boundaries` with summed values (0 for empty buckets).
 */
export function aggregateEntries(
  entries: { value: number; date: Date | string }[],
  boundaries: LabeledDateBoundary[],
): number[] {
  const totals = new Array<number>(boundaries.length).fill(0);

  for (const entry of entries) {
    const dateKey = toLocalDateKey(entry.date);

    for (let i = 0; i < boundaries.length; i++) {
      if (dateKey >= boundaries[i].start && dateKey <= boundaries[i].end) {
        totals[i] += entry.value;
      }
    }
  }

  return totals;
}
