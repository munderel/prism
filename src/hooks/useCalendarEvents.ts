'use client';

import useSWR from 'swr';

import type { KeyedMutator } from 'swr';

interface CalendarEventsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[];
  error: unknown;
  googleStatus: 'ok' | 'error' | 'not_connected' | null;
  googleError?: string;
  refreshEvents: KeyedMutator<any>;
  isLoading: boolean;
}

export function useCalendarEvents(
  start: string | null,
  end: string | null
): CalendarEventsResult {
  const key =
    start && end ? `/api/calendar?start=${start}&end=${end}&source=all` : null;
  const { data, error, mutate } = useSWR(key, { revalidateOnFocus: false });

  // Handle both old (array) and new (object) response shapes
  const events = Array.isArray(data) ? data : (data?.events ?? []);
  const googleStatus = Array.isArray(data) ? null : (data?.googleStatus ?? null);
  const googleError = Array.isArray(data) ? undefined : data?.googleError;

  // Debug: log when data arrives or errors occur
  if (error) {
    console.error('[useCalendarEvents] SWR error:', error);
  }
  if (key && data && events.length === 0) {
    console.warn('[useCalendarEvents] API returned 0 events for range', key);
  }

  return {
    events,
    error,
    googleStatus,
    googleError,
    refreshEvents: mutate,
    isLoading: !data && !error,
  };
}
