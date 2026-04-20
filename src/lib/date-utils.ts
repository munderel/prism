/**
 * Date utilities that handle timezone correctly.
 *
 * The core problem: `new Date().toISOString().split('T')[0]` converts to UTC
 * before extracting the date, so users in UTC+ timezones get tomorrow's date
 * and users in UTC- timezones can get yesterday's date after midnight UTC.
 *
 * These helpers always return dates in the user's LOCAL timezone.
 */

/**
 * Returns a 'YYYY-MM-DD' string in the user's local timezone.
 * With no argument, returns today's date.
 * Use this instead of `new Date().toISOString().split('T')[0]`.
 */
export function getLocalDateString(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns tomorrow's date as 'YYYY-MM-DD' in the user's local timezone.
 * Use this instead of `new Date(Date.now() + 86400000).toISOString().split('T')[0]`.
 */
export function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
}

/**
 * Converts a 'YYYY-MM-DD' string to a Date at local midnight.
 * Use this instead of `new Date(dateString)` which parses date-only strings as UTC.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return new Date(); // Fallback to now for malformed input
  }
  return new Date(y, m - 1, d);
}

/**
 * Extracts 'YYYY-MM-DD' from a Date or ISO string in local timezone.
 * Handles both Date objects and ISO strings from the database.
 *
 * For bare 'YYYY-MM-DD' strings, returns them as-is (they already represent
 * a local date). For full ISO strings or Date objects, extracts the local date.
 */
export function toLocalDateKey(dateOrString: Date | string): string {
  if (typeof dateOrString === 'string') {
    // Bare YYYY-MM-DD string — return as-is, it already represents a local date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOrString)) {
      return dateOrString;
    }
    // Full ISO string (e.g., '2026-03-29T05:00:00.000Z') — parse and extract local date
    return getLocalDateString(new Date(dateOrString));
  }
  return getLocalDateString(dateOrString);
}

/**
 * Formats a date for human-readable display.
 * Returns "Mar 29, 2026" by default, or "Sunday, March 29, 2026" with weekday option.
 * Returns '—' for null/undefined/invalid input.
 */
export function formatDisplayDate(
  dateOrString: Date | string | null | undefined,
  options?: { weekday?: boolean },
): string {
  if (!dateOrString) return '\u2014';
  const d = typeof dateOrString === 'string' ? new Date(dateOrString.includes('T') ? dateOrString : `${dateOrString}T00:00:00`) : dateOrString;
  if (isNaN(d.getTime())) return '\u2014';
  const fmt: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: options?.weekday ? 'long' : 'short',
    day: 'numeric',
  };
  if (options?.weekday) fmt.weekday = 'long';
  return d.toLocaleDateString('en-US', fmt);
}

/**
 * Returns a Date representing the start of today (midnight local time).
 */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Date boundary helpers ────────────────────────────────────────────────────

export interface DateBoundary {
  start: string;
  end: string;
}

export interface LabeledDateBoundary extends DateBoundary {
  label: string;
}

/**
 * Returns the Monday–Sunday boundaries of the week containing the given date
 * (defaults to today) as YYYY-MM-DD strings in local timezone.
 */
export function getWeekBoundaries(date?: Date): DateBoundary {
  const d = date ? new Date(date) : new Date();
  // getDay(): 0 = Sunday, 1 = Monday, …, 6 = Saturday
  // Shift so Monday = 0, …, Sunday = 6
  const dayOfWeek = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: getLocalDateString(monday),
    end: getLocalDateString(sunday),
  };
}

/**
 * Returns the Monday–Sunday boundaries of the week *after* the week containing
 * the given date (defaults to today) as YYYY-MM-DD strings in local timezone.
 * Used by weekly review planning steps that look at the upcoming week.
 */
export function getUpcomingWeekBoundaries(date?: Date): DateBoundary {
  const d = date ? new Date(date) : new Date();
  const dayOfWeek = (d.getDay() + 6) % 7;
  const upcomingMonday = new Date(d);
  upcomingMonday.setDate(d.getDate() - dayOfWeek + 7);
  const upcomingSunday = new Date(upcomingMonday);
  upcomingSunday.setDate(upcomingMonday.getDate() + 6);
  return {
    start: getLocalDateString(upcomingMonday),
    end: getLocalDateString(upcomingSunday),
  };
}

/**
 * Returns the first and last day of the month containing the given date
 * (defaults to today) as YYYY-MM-DD strings in local timezone.
 */
export function getMonthBoundaries(date?: Date): DateBoundary {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0); // day 0 of next month = last day of this month
  return {
    start: getLocalDateString(firstDay),
    end: getLocalDateString(lastDay),
  };
}

/**
 * Returns Jan 1 and Dec 31 of the year containing the given date
 * (defaults to today) as YYYY-MM-DD strings in local timezone.
 */
export function getYearBoundaries(date?: Date): DateBoundary {
  const year = (date ?? new Date()).getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

/**
 * Returns an array of labeled week boundaries that fall within (or overlap)
 * the given month. Weeks start on Monday. Partial weeks at the start or end
 * of the month are included, clipped to the month boundaries.
 *
 * @param year  Full 4-digit year (e.g. 2026)
 * @param month 1-based month number (1 = January, 12 = December)
 */
export function getWeeksInMonth(year: number, month: number): LabeledDateBoundary[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);

  const weeks: LabeledDateBoundary[] = [];
  // Start from the Monday of the first week that contains any day in the month
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const cursor = new Date(firstOfMonth);
  cursor.setDate(firstOfMonth.getDate() - dayOfWeek); // rewind to Monday

  let weekIndex = 1;
  while (cursor <= lastOfMonth) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(cursor.getDate() + 6);

    // Clip to month boundaries
    const clippedStart = weekStart < firstOfMonth ? firstOfMonth : weekStart;
    const clippedEnd = weekEnd > lastOfMonth ? lastOfMonth : weekEnd;

    weeks.push({
      label: `Week ${weekIndex}`,
      start: getLocalDateString(clippedStart),
      end: getLocalDateString(clippedEnd),
    });

    weekIndex++;
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

/** Short month names in order, used as labels. */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Returns an array of labeled month boundaries for every month in the given year.
 *
 * @param year Full 4-digit year (e.g. 2026)
 */
export function getMonthsInYear(year: number): LabeledDateBoundary[] {
  return MONTH_LABELS.map((label, i) => ({
    label,
    start: getLocalDateString(new Date(year, i, 1)),
    end: getLocalDateString(new Date(year, i + 1, 0)),
  }));
}
