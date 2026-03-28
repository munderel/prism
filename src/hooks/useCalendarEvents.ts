import useSWR from 'swr';

export function useCalendarEvents(start: string | null, end: string | null) {
  const { data, error, mutate } = useSWR(
    start && end ? `/api/calendar?start=${start}&end=${end}&source=all` : null
  );
  return { events: data ?? [], error, refreshEvents: mutate, isLoading: !data && !error };
}
