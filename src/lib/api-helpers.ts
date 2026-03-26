/**
 * Pick only defined (non-undefined) fields from an input object.
 * Useful in PATCH handlers to build partial update payloads.
 */
export function pickDefined<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  fields: string[]
): Partial<T> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field];
    }
  }
  return data as Partial<T>;
}

/**
 * Parse and clamp pagination params from URL search params.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 20,
  maxLimit = 100
) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(searchParams.get('limit') ?? String(defaultLimit), 10)));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Build standard cache-control response headers.
 */
export function cacheHeaders(maxAge = 10, staleWhileRevalidate = 60) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': `private, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}

/**
 * Enrich a training item (with included trainingTasks→task) with progress counts.
 */
export function enrichTrainingProgress<
  T extends { trainingTasks: { task: { status: string } }[] }
>(item: T) {
  const totalTasks = item.trainingTasks.length;
  const completedTasks = item.trainingTasks.filter(
    (tt) => tt.task.status === 'DONE'
  ).length;
  return {
    ...item,
    totalTasks,
    completedTasks,
    progressPct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };
}
