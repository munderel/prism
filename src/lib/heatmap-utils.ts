/**
 * Heatmap helpers — pure functions used by StreakHeatmap and GoalActivityHeatmap
 * to decide which cells deserve the "gold" treatment.
 *
 * The two rules are independent:
 *  - `isStreakMilestoneDay` fires on daily-AIM heatmaps when a day completes
 *    a canonical streak length (7, 14, 30, …).
 *  - `isWeekCrossingDay` fires on weekly-target AIM heatmaps when a single
 *    day's completion pushes the ISO week's count strictly above the target.
 */

import { isDayActive } from '@/lib/aim-streak-engine';
import { getLocalDateString, isoWeekKey, parseLocalDate } from '@/lib/date-utils';

export const STREAK_MILESTONES: readonly number[] = [7, 14, 30, 60, 100, 200, 365];

export interface HistoryEntry {
  date: string;
  completed: boolean;
}

/**
 * Returns true when `dateKey` is the final day of a canonical streak milestone
 * (e.g. the 7th, 14th, 30th… consecutive completed active day ending on this date).
 *
 * Streaks count only active weekdays (per `activeWeekdays` bitmask). Inactive
 * days are skipped — they neither extend nor break the streak. An active day
 * with no completion breaks the streak.
 */
export function isStreakMilestoneDay(
  history: HistoryEntry[],
  activeWeekdays: number,
  dateKey: string,
): boolean {
  if (activeWeekdays === 0) return false;

  const completedSet = new Set(history.filter((e) => e.completed).map((e) => e.date));
  if (!completedSet.has(dateKey)) return false;

  let streak = 0;
  const cursor = parseLocalDate(dateKey);

  // Walk backwards up to 365 days, mirroring computeDailyStreak's bound.
  for (let i = 0; i < 365; i++) {
    const dow = cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    if (isDayActive(activeWeekdays, dow)) {
      const key = getLocalDateString(cursor);
      if (completedSet.has(key)) {
        streak++;
      } else {
        break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return STREAK_MILESTONES.includes(streak);
}

/**
 * Returns true when `dateKey` is the day a weekly-target AIM's ISO week
 * first exceeds its target. Specifically: the (weeklyTarget + 1)-th
 * completion of that ISO week (chronologically). Days at or below target
 * return false; days after the crossing return false.
 */
export function isWeekCrossingDay(
  history: HistoryEntry[],
  weeklyTarget: number,
  dateKey: string,
): boolean {
  if (weeklyTarget <= 0) return false;

  const completionsOnDate = history.some((e) => e.date === dateKey && e.completed);
  if (!completionsOnDate) return false;

  const targetWeek = isoWeekKey(parseLocalDate(dateKey));
  const sameWeekCompleted = history
    .filter((e) => e.completed && isoWeekKey(parseLocalDate(e.date)) === targetWeek)
    .map((e) => e.date)
    .sort();

  // The day that *first* exceeds the target is at index `weeklyTarget` (0-based),
  // i.e. the (weeklyTarget + 1)-th completion.
  return sameWeekCompleted[weeklyTarget] === dateKey;
}
