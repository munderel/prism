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
/**
 * Standard 404 response.
 */
export function notFoundResponse(entity = 'Resource') {
  return Response.json({ error: `${entity} not found` }, { status: 404 });
}

/**
 * Standard 403 response.
 */
export function forbiddenResponse() {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Validate that a value is an integer between min and max (inclusive).
 */
export function isValidIntRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Validate ICE scores (impact, confidence, ease) are integers 1-5.
 * Returns an error message string or null if valid.
 */
export function validateIceScores(scores: Record<string, unknown>): string | null {
  for (const [name, value] of Object.entries(scores)) {
    if (!isValidIntRange(value, 1, 5)) {
      return `${name} must be an integer between 1 and 5`;
    }
  }
  return null;
}

/**
 * Normalize and validate an email address.
 * Returns { email } on success, { error } on failure.
 */
export function validateEmail(raw: unknown): { email: string; error?: never } | { email?: never; error: string } {
  if (!raw || typeof raw !== 'string') {
    return { error: 'Email is required' };
  }
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Invalid email format' };
  }
  return { email };
}

/**
 * Safely parse JSON from a Request body.
 * Returns { data } on success, { error } with a Response on failure.
 */
export async function safeParseJson<T = any>(
  request: Request
): Promise<{ data: T; error?: never } | { data?: never; error: Response }> {
  try {
    const data = await request.json();
    return { data };
  } catch {
    return {
      error: Response.json(
        { error: 'Invalid or missing JSON body' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Validate password strength.
 * Returns null if valid, or an error message string.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return 'Password must be at least 12 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least one digit';
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

/**
 * Prisma select for user summary fields — reuse wherever you include a user relation.
 */
export const USER_SUMMARY_SELECT = { id: true, name: true, image: true } as const;

/**
 * Check if a user owns a resource (or is an admin).
 * Returns true if access is allowed.
 */
export function hasAccess(resourceOwnerId: string, userId: string, isAdmin: boolean): boolean {
  return isAdmin || resourceOwnerId === userId;
}

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
