import { addDays, addWeeks, addMonths } from 'date-fns';

export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
}

const VALID_FREQS = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);

/**
 * Parse an RRULE-like string into a RecurrenceRule.
 * Format: "FREQ=DAILY", "FREQ=WEEKLY;INTERVAL=2", etc.
 */
export function parseRRule(rule: string): RecurrenceRule {
  if (!rule) throw new Error('Empty recurrence rule');

  const parts = rule.split(';');
  const map = new Map<string, string>();

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) map.set(key, value);
  }

  const freq = map.get('FREQ');
  if (!freq || !VALID_FREQS.has(freq)) {
    throw new Error(`Invalid or missing FREQ in rule: ${rule}`);
  }

  const interval = map.has('INTERVAL') ? parseInt(map.get('INTERVAL')!, 10) : 1;
  if (isNaN(interval) || interval < 1) {
    throw new Error(`Invalid INTERVAL in rule: ${rule}`);
  }

  return { freq: freq as RecurrenceRule['freq'], interval };
}

/**
 * Compute the next occurrence date from a given date and recurrence rule.
 */
export function getNextOccurrence(date: Date, rule: RecurrenceRule): Date {
  switch (rule.freq) {
    case 'DAILY':
      return addDays(date, rule.interval);
    case 'WEEKLY':
      return addWeeks(date, rule.interval);
    case 'MONTHLY':
      return addMonths(date, rule.interval);
  }
}
