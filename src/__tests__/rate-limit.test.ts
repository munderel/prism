import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  let limiter: ReturnType<typeof rateLimit>;

  beforeEach(() => {
    limiter = rateLimit({ interval: 60_000, limit: 3 });
  });

  it('allows requests under the limit', () => {
    const result = limiter.check('192.168.1.1');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('blocks requests over the limit', () => {
    limiter.check('192.168.1.1');
    limiter.check('192.168.1.1');
    limiter.check('192.168.1.1');
    const result = limiter.check('192.168.1.1');
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks IPs independently', () => {
    limiter.check('192.168.1.1');
    limiter.check('192.168.1.1');
    limiter.check('192.168.1.1');

    const result = limiter.check('192.168.1.2');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
