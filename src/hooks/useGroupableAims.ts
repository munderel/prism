'use client';

import useSWR from 'swr';
import type { GroupableAimItem } from '@/components/aims/AttendAimModal';

interface UseGroupableAimsResult {
  items: GroupableAimItem[];
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}

/**
 * Fetches groupable (social) AIM instances from teammates for the given date range.
 * start/end should be ISO strings covering the currently visible calendar window.
 */
export function useGroupableAims(
  start: string | null,
  end: string | null,
): UseGroupableAimsResult {
  const key =
    start && end
      ? `/api/calendar/groupable-aims?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      : null;

  const { data, error, mutate } = useSWR<GroupableAimItem[]>(key, {
    revalidateOnFocus: false,
  });

  return {
    items: data ?? [],
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
}
