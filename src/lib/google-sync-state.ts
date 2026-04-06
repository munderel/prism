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
