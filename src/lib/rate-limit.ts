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

export function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
