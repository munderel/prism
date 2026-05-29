import { mutate } from 'swr';

/**
 * Cross-area SWR invalidation helpers (Issue 15).
 *
 * Mutations in Prism ripple across several views: completing a task changes the
 * task list AND the calendar AND the leaderboard AND streaks AND goal progress.
 * Components used to revalidate only their own SWR key, leaving the other views
 * stale until a manual refresh. These helpers revalidate every dependent key in
 * one call so a change is reflected live everywhere.
 *
 * Implementation: SWR's global `mutate` accepts a key-filter function. We match
 * by string prefix so every parameterised variant of an endpoint
 * (e.g. `/api/tasks?date=…`, `/api/calendar?start=…`) is revalidated. Matching
 * is cheap and SWR dedupes in-flight requests, so this stays responsive.
 */
function revalidatePrefixes(prefixes: string[]): Promise<unknown> {
  return mutate(
    (key) => typeof key === 'string' && prefixes.some((p) => key === p || key.startsWith(p)),
    undefined,
    { revalidate: true },
  );
}

/** Task created / completed / edited / assigned / scheduled. */
export function invalidateAfterTaskChange(): Promise<unknown> {
  return revalidatePrefixes([
    '/api/tasks',
    '/api/calendar',
    '/api/leaderboard',
    '/api/streaks',
    '/api/reports',
    '/api/goals',
  ]);
}

/** Aim completed / scheduled / attended / phase change. */
export function invalidateAfterAimChange(): Promise<unknown> {
  return revalidatePrefixes([
    '/api/aims',
    '/api/calendar',
    '/api/leaderboard',
    '/api/streaks',
  ]);
}

/** Calendar drag/drop, work block, meal, or any scheduling change. */
export function invalidateAfterCalendarChange(): Promise<unknown> {
  return revalidatePrefixes([
    '/api/calendar',
    '/api/tasks',
    '/api/aims',
    '/api/food-blocks',
    '/api/work-blocks',
  ]);
}

/** Review / powerdown completion. */
export function invalidateAfterRitualChange(): Promise<unknown> {
  return revalidatePrefixes([
    '/api/reviews',
    '/api/calendar',
    '/api/leaderboard',
    '/api/streaks',
  ]);
}

/** Goal / KPI edit that affects rollups and progress. */
export function invalidateAfterGoalChange(): Promise<unknown> {
  return revalidatePrefixes([
    '/api/goals',
    '/api/stacks',
    '/api/kpis',
    '/api/leaderboard',
  ]);
}
