// Tests run with timezoneId 'America/Los_Angeles' (set in playwright.config.ts).
// Use these helpers so date assertions are deterministic.

export function todayKey(): string {
  return ymd(new Date());
}

export function ymd(d: Date): string {
  // YYYY-MM-DD in local (PT) time
  const tz = 'America/Los_Angeles';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return parts; // en-CA already gives YYYY-MM-DD
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function tomorrowKey(): string {
  return ymd(addDays(new Date(), 1));
}
