'use client';

import useSWR from 'swr';

import type { KeyedMutator } from 'swr';

interface CalendarEventsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[];
  error: unknown;
  refreshEvents: KeyedMutator<any>;
  isLoading: boolean;
}

export function useCalendarEvents(
  start: string | null,
  end: string | null
): CalendarEventsResult {
  const key =
    start && end ? `/api/calendar?start=${start}&end=${end}&source=all` : null;
  const { data, error, mutate } = useSWR(key);

  return {
    events: data ?? [],
    error,
    refreshEvents: mutate,
    isLoading: !data && !error,
  };
}
