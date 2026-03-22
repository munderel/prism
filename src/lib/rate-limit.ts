// TODO: This in-memory rate limiter does not work across serverless invocations.
// For production on Vercel, replace with Upstash Redis or Vercel KV.
// See: https://vercel.com/guides/rate-limiting-edge-middleware-vercel-kv

type RateLimitResult = {
  success: boolean;
  remaining: number;
};

type Options = {
  interval: number; // milliseconds
  limit: number;    // max requests per interval
};

export function rateLimit(options: Options) {
  const { interval, limit } = options;
  const tokens = new Map<string, { count: number; expiresAt: number }>();

  return {
    check(ip: string): RateLimitResult {
      const now = Date.now();
      const record = tokens.get(ip);

      if (!record || now > record.expiresAt) {
        tokens.set(ip, { count: 1, expiresAt: now + interval });
        return { success: true, remaining: limit - 1 };
      }

      if (record.count >= limit) {
        return { success: false, remaining: 0 };
      }

      record.count++;
      return { success: true, remaining: limit - record.count };
    },
  };
}

// Pre-configured limiters for API routes
export const commentLimiter = rateLimit({ interval: 60_000, limit: 20 });
export const notificationLimiter = rateLimit({ interval: 60_000, limit: 10 });
export const taskLimiter = rateLimit({ interval: 60_000, limit: 30 });
export const goalLimiter = rateLimit({ interval: 60_000, limit: 30 });

export function getClientIp(request: Request): string {
  // Prefer Vercel's non-spoofable header, fall back to x-forwarded-for for local dev
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
