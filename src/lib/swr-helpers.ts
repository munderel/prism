/**
 * Returns an SWR `mutate` matcher that invalidates every cached key starting
 * with `prefix`. Use this with `mutate(matchPrefix('/api/work-blocks'))` so
 * parameterised keys (`/api/work-blocks?date=…`) are also invalidated; bare
 * `mutate('/api/work-blocks')` only hits the exact-string key and misses
 * every variant.
 */
export function matchPrefix(prefix: string): (key: unknown) => boolean {
  return (key) => typeof key === 'string' && key.startsWith(prefix);
}
