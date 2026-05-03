import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

// Server code runs in whatever timezone the host machine is configured with
// (often UTC on Vercel). Every place that reasons about "today", "this week",
// "the user's day" for a specific User must operate in that user's timezone
// to avoid off-by-one-day bugs on DST transitions and users west of UTC.
//
// This module wraps date-fns-tz with narrow, opinionated helpers that route
// fixes can adopt without rebuilding TZ logic per call site. Prefer these
// over src/lib/date-utils.ts when a User.timezone is available.

/**
 * Returns the UTC instant rendered as a Date whose getFullYear/getMonth/
 * getDate/getHours match what the user would see on the wall clock in
 * their timezone. Useful only for display code; for arithmetic, prefer
 * `toUserDayStamp` + string helpers or the boundary helpers below.
 */
export function toUserLocalDate(utc: Date, tz: string): Date {
  return toZonedTime(utc, tz);
}

/**
 * Returns the calendar date for `utc` as the user would name it in their
 * timezone, as a 'YYYY-MM-DD' string. Stable across DST transitions.
 */
export function toUserDayStamp(utc: Date, tz: string): string {
  return formatInTimeZone(utc, tz, 'yyyy-MM-dd');
}

/**
 * Parses a bare 'YYYY-MM-DD' string as midnight on that date in the user's
 * timezone, returned as a UTC Date. Avoids the
 * `new Date('2026-03-29T00:00:00')` trap which silently uses the server's
 * local timezone. DST-safe: on spring-forward days the 00:00 wall time
 * resolves to the post-jump instant (same behavior as date-fns-tz).
 */
export function dstSafeDate(yyyyMmDd: string, tz: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    throw new Error(`Expected YYYY-MM-DD, got ${JSON.stringify(yyyyMmDd)}`);
  }
  return fromZonedTime(`${yyyyMmDd}T00:00:00`, tz);
}

/**
 * Returns UTC Date boundaries for the week containing `at` in the user's
 * timezone. `weekStartDay` is 0=Sun..6=Sat, matching
 * `GoalStack.weekStartDay`. The end boundary is the start of the NEXT week
 * (half-open `[start, end)`), so callers can use `< end` comparisons without
 * worrying about an off-by-one ms.
 */
export function weekBoundariesForUser(
  at: Date,
  tz: string,
  weekStartDay: number = 0,
): { start: Date; end: Date } {
  if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
    throw new Error(`weekStartDay must be 0..6, got ${weekStartDay}`);
  }
  // date-fns-tz 'i' = ISO day (1=Mon..7=Sun). Convert to JS getDay (0=Sun..6=Sat).
  const isoDow = Number(formatInTimeZone(at, tz, 'i'));
  const currentDow = isoDow % 7;
  const daysSinceStart = (currentDow - weekStartDay + 7) % 7;

  const currentStamp = toUserDayStamp(at, tz);
  const startStamp = shiftDayStamp(currentStamp, -daysSinceStart);
  const endStamp = shiftDayStamp(startStamp, 7);
  return {
    start: dstSafeDate(startStamp, tz),
    end: dstSafeDate(endStamp, tz),
  };
}

/**
 * Returns UTC Date boundaries for the single user-local day containing `at`,
 * half-open `[start, end)`.
 */
export function dayBoundariesForUser(at: Date, tz: string): { start: Date; end: Date } {
  const stamp = toUserDayStamp(at, tz);
  const nextStamp = shiftDayStamp(stamp, 1);
  return {
    start: dstSafeDate(stamp, tz),
    end: dstSafeDate(nextStamp, tz),
  };
}

// Day arithmetic on YYYY-MM-DD strings without going through any tz-sensitive
// Date constructor. Uses UTC internally so month/year rollover is correct.
export function shiftDayStamp(stamp: string, days: number): string {
  const [y, m, d] = stamp.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const shifted = new Date(base + days * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Returns the UTC instant for midnight `days` calendar days before `at`, in the
 * user's timezone. DST-safe — does NOT use `setDate` / `getDate` arithmetic on
 * a UTC Date (which silently uses server-local time and breaks across DST or
 * when the server tz differs from the user tz).
 */
export function subtractDaysInUserTz(at: Date, tz: string, days: number): Date {
  return dstSafeDate(shiftDayStamp(toUserDayStamp(at, tz), -days), tz);
}
