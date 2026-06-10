/**
 * AIM-specific streak computation.
 *
 * Separates daily-AIM streaks (must complete every active weekday) from
 * weekly-AIM streaks (must hit the target N completions per ISO week).
 *
 * All date arithmetic is performed in calendar days, not hours, so DST
 * transitions and year boundaries are handled correctly.
 *
 * Bitmask convention (matches `UserAim.activeWeekdays`):
 *   Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64
 * JS Date.getDay() returns 0=Sun…6=Sat, so  bit position = 1 << dayOfWeek.
 */

import { toLocalDateKey, getLocalDateString } from '@/lib/date-utils';
import { toUserDayStamp, shiftDayStamp } from '@/lib/user-timezone';

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD stamp. Parsed in UTC so the
 *  weekday is tz-independent (a calendar date's weekday doesn't depend on tz). */
function dowOfStamp(stamp: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y, m, d] = stamp.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** ISO-week key (e.g. "2026-W21") for a YYYY-MM-DD stamp, computed in UTC. */
function isoWeekKeyFromStamp(stamp: string): string {
  const [y, m, d] = stamp.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Resolve a scheduledDate to its YYYY-MM-DD key in the given tz (or server-local
 *  when tz is omitted — correct for client callers running in the browser). */
function dayStampOf(value: Date | string, timezone?: string): string {
  return timezone ? toUserDayStamp(new Date(value), timezone) : toLocalDateKey(value);
}

// ---------------------------------------------------------------------------
// Bitmask helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the given JS day-of-week (0=Sun…6=Sat) is set in the
 * bitmask. JS getDay() maps directly to bit position: Sun → bit 0 (value 1),
 * Mon → bit 1 (value 2), …, Sat → bit 6 (value 64).
 */
export function isDayActive(weekdayBitmask: number, dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
  return (weekdayBitmask & (1 << dayOfWeek)) !== 0;
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface AimInstanceRow {
  scheduledDate: Date | string;
  completedAt: Date | string | null;
  /**
   * AimInstance.status — one of 'SCHEDULED' | 'COMPLETED' | 'SKIPPED' | 'MISSED'
   * (or other string values added in the future). Optional so older callers
   * that only select { scheduledDate, completedAt } still type-check; when
   * absent the classifier falls back to `completedAt != null`.
   */
  status?: string | null;
}

/**
 * Per-day classification used by both daily and weekly streak counters.
 *
 *  - 'completed': contributes to the streak (daily: 1 day; weekly: +1 count).
 *  - 'skipped':   "vacation day" — neutral. Bridges daily streaks like an
 *                 inactive weekday; does NOT increment weekly counts and does
 *                 NOT disqualify the week.
 *  - 'breaks':    active-day no-show (MISSED, past-dated SCHEDULED, or any
 *                 other non-completed/non-skipped status). Daily streak ends;
 *                 weekly count is unaffected (still needs to clear target).
 */
export type StreakDayClass = 'completed' | 'skipped' | 'breaks';

export function classifyInstanceForStreak(
  inst: { status?: string | null; completedAt: Date | string | null },
): StreakDayClass {
  if (inst.status === 'COMPLETED' || inst.completedAt != null) return 'completed';
  if (inst.status === 'SKIPPED') return 'skipped';
  return 'breaks';
}

export interface DailyStreakResult {
  /** Number of consecutive active days (per bitmask) that were completed. */
  currentStreak: number;
}

export interface WeeklyStreakResult {
  /** Consecutive hit weeks (completions >= weeklyTarget). */
  currentStreak: number;
  /**
   * Number of those weeks where completions STRICTLY exceeded weeklyTarget.
   * Used by the UI to render "gold" indicators.
   */
  goldWeeks: number;
}

// ---------------------------------------------------------------------------
// Daily streak counter
// ---------------------------------------------------------------------------

/**
 * Walk backwards from today (or `asOf`) and count consecutive active days
 * where the AIM was completed.
 *
 * Rules:
 *  - A day is "active" when its JS dayOfWeek bit is set in `activeWeekdays`.
 *  - An active day with no completed instance breaks the streak.
 *  - An inactive day neither breaks nor extends the streak.
 *  - If `activeWeekdays === 0` (no active days), returns 0.
 *  - Stops looking back after 365 days to bound the scan.
 */
export function computeDailyStreak(
  instances: AimInstanceRow[],
  activeWeekdays: number,
  asOf?: Date,
  timezone?: string,
): DailyStreakResult {
  if (activeWeekdays === 0) return { currentStreak: 0 };

  // Index each YYYY-MM-DD scheduledDate to its streak classification. If a
  // day has multiple instances (rare — e.g. a one-off plus a regular row),
  // 'completed' wins over 'skipped' wins over 'breaks' so the user gets the
  // most generous interpretation. Keys are derived in the user's tz when given,
  // else server-local (browser-local for client callers) — the cursor below
  // uses the SAME frame so the comparison is consistent.
  const dayClass = new Map<string, StreakDayClass>();
  const promote = (current: StreakDayClass | undefined, next: StreakDayClass): StreakDayClass => {
    if (current === 'completed' || next === 'completed') return 'completed';
    if (current === 'skipped' || next === 'skipped') return 'skipped';
    return 'breaks';
  };
  for (const inst of instances) {
    const key = dayStampOf(inst.scheduledDate, timezone);
    const cls = classifyInstanceForStreak(inst);
    dayClass.set(key, promote(dayClass.get(key), cls));
  }

  // "Today" in the same frame, as a YYYY-MM-DD stamp; walk back via string math
  // (DST-safe, server-tz-independent) rather than Date.setDate.
  const todayStamp = timezone
    ? toUserDayStamp(asOf ?? new Date(), timezone)
    : getLocalDateString(asOf ?? new Date());

  let streak = 0;
  let cursorStamp = todayStamp;

  // Walk back up to 365 days to avoid infinite loops on edge cases.
  for (let i = 0; i < 365; i++) {
    const dow = dowOfStamp(cursorStamp);

    if (isDayActive(activeWeekdays, dow)) {
      const cls = dayClass.get(cursorStamp);
      if (cls === 'completed') {
        streak++;
      } else if (cls === 'skipped') {
        // Vacation day — neither increments nor breaks the streak.
      } else {
        // Active day with no completion (MISSED, past-dated SCHEDULED, or
        // simply no row) — streak is broken.
        break;
      }
    }
    // Inactive day — skip back another day without breaking.
    cursorStamp = shiftDayStamp(cursorStamp, -1);
  }

  return { currentStreak: streak };
}

// ---------------------------------------------------------------------------
// Weekly streak counter
// ---------------------------------------------------------------------------

/**
 * Walk backwards from the current ISO week (or `asOf` week) and count
 * consecutive weeks where completions >= weeklyTarget.
 *
 * Rules:
 *  - A week is a "hit" when its completion count >= weeklyTarget.
 *  - A week is "gold" when its completion count > weeklyTarget.
 *  - The CURRENT (in-progress) week is special-cased: if it has not hit the
 *    target YET it is skipped (neither counted nor breaking) so the streak keeps
 *    reflecting completed prior weeks — previously the streak collapsed to 0 at
 *    the start of every new week until the target was re-hit.
 *  - The first COMPLETED prior week below target stops the streak.
 *  - If `weeklyTarget <= 0`, returns { currentStreak: 0, goldWeeks: 0 }.
 *  - Scans back a maximum of 52 weeks. Day-keys are derived in the user's tz
 *    when provided, else server-local (browser-local for client callers).
 */
export function computeWeeklyStreak(
  instances: AimInstanceRow[],
  weeklyTarget: number,
  asOf?: Date,
  timezone?: string,
): WeeklyStreakResult {
  if (weeklyTarget <= 0) return { currentStreak: 0, goldWeeks: 0 };

  // Count COMPLETED instances per ISO week. SKIPPED and MISSED (and any
  // other status) are ignored — they neither count toward the target nor
  // disqualify the week. A week is satisfied iff completedCount >= weeklyTarget.
  const weekCounts = new Map<string, number>();
  for (const inst of instances) {
    if (classifyInstanceForStreak(inst) !== 'completed') continue;
    const key = isoWeekKeyFromStamp(dayStampOf(inst.scheduledDate, timezone));
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }

  // Anchor on today's stamp; stepping back 7 calendar days stays in consecutive
  // ISO weeks regardless of which weekday the anchor falls on.
  let cursorStamp = timezone
    ? toUserDayStamp(asOf ?? new Date(), timezone)
    : getLocalDateString(asOf ?? new Date());

  let streak = 0;
  let goldWeeks = 0;

  for (let w = 0; w < 52; w++) {
    const key = isoWeekKeyFromStamp(cursorStamp);
    const count = weekCounts.get(key) ?? 0;

    if (count >= weeklyTarget) {
      streak++;
      if (count > weeklyTarget) goldWeeks++;
      cursorStamp = shiftDayStamp(cursorStamp, -7);
    } else if (w === 0) {
      // Current week not hit YET — skip it without breaking the streak.
      cursorStamp = shiftDayStamp(cursorStamp, -7);
    } else {
      break;
    }
  }

  return { currentStreak: streak, goldWeeks };
}
