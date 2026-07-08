import { prisma } from '@/lib/prisma';

/**
 * DB-backed sliding-window rate limiting for high-volume mutation routes.
 *
 * Generalizes the inline DB-count pattern already used by registration
 * (LoginAttempt rows) and invitations (Invitation rows): count recent
 * RateLimitEvent rows for a key, reject with 429 when over the limit,
 * otherwise record one event. DB-backed (not in-memory) so the window
 * survives serverless cold starts and is shared across instances.
 *
 * Limits are deliberately generous — they exist to stop runaway scripts and
 * abuse, not to throttle humans (SWR retry bursts and YAML imports must
 * never trip them).
 */

/** Default budget for authenticated write routes: 120 writes per 5 minutes per user. */
export const WRITE_RATE_LIMIT = 120;
export const WRITE_RATE_WINDOW_MS = 5 * 60 * 1000;

/** Events older than this are dead weight and get opportunistically purged. */
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Probability that any given allowed call also sweeps old rows (~1%). */
const CLEANUP_PROBABILITY = 0.01;

/**
 * Enforce a sliding-window rate limit for `key` (convention: `<route>:<userId>`).
 *
 * Returns a ready-to-return 429 Response when the caller is over the limit,
 * or null when the call is allowed (in which case one event row was recorded).
 *
 * Usage in a route handler, immediately after auth:
 *   const limited = await enforceRateLimit(`tasks:${auth.userId}`, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  const windowStart = new Date(Date.now() - windowMs);
  const recentCount = await prisma.rateLimitEvent.count({
    where: { key, createdAt: { gte: windowStart } },
  });

  if (recentCount >= limit) {
    return Response.json(
      { error: 'Rate limit exceeded. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  await prisma.rateLimitEvent.create({ data: { key } });

  // Opportunistic cleanup so the table stays small on serverless (no cron
  // dependency). Awaited but non-fatal: a failed sweep never blocks the
  // originating request.
  if (Math.random() < CLEANUP_PROBABILITY) {
    try {
      await prisma.rateLimitEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - CLEANUP_MAX_AGE_MS) } },
      });
    } catch {
      // Best-effort only — stale rows just wait for the next sweep.
    }
  }

  return null;
}
