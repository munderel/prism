import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getDateKey(date: Date, timezone: string): string {
  const zoned = toZonedTime(date, timezone);
  return `${zoned.getFullYear()}-${pad2(zoned.getMonth() + 1)}-${pad2(zoned.getDate())}`;
}

export function parseLocalDateKey(dateKey: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, timezone);
}

export interface GoogleEventOverride {
  googleEventId?: string;
  start: string;
  end: string;
  updatedAt?: string;
}

export interface ManagedRecurringSeriesState {
  eventId: string;
  overrides?: Record<string, GoogleEventOverride>;
  cancelledDates?: string[];
  lastSyncedAt?: string;
}

export interface GoogleSyncState {
  recurringReviews?: Partial<Record<'WEEKLY' | 'MONTHLY' | 'YEARLY', ManagedRecurringSeriesState>>;
  powerdown?: ManagedRecurringSeriesState;
  processes?: Record<string, ManagedRecurringSeriesState>;
}

export function parseGoogleSyncState(raw: unknown): GoogleSyncState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return raw as GoogleSyncState;
}

export function cloneGoogleSyncState(state: GoogleSyncState): GoogleSyncState {
  return JSON.parse(JSON.stringify(state ?? {}));
}

export function normalizeCancelledDates(series?: ManagedRecurringSeriesState): string[] {
  return Array.from(new Set(series?.cancelledDates ?? [])).sort();
}

/**
 * Parse `User.googleSyncTokenByCalendar` (a JSON map of calendarId → Google
 * incremental nextSyncToken) into a plain string→string record. Used by the
 * sync engine's incremental change-gate (Issue 8).
 */
export function parseSyncTokens(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}
