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
