/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

// The module under test imports prisma transitively. We stub the usual
// dependencies so importing calendar.ts does not try to connect to a DB.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((t: string) => t),
}));

vi.mock('@/lib/completion-token', () => ({
  getCompletionUrl: vi.fn(() => 'http://example.test/c/tok'),
}));

import { classifyGoogleError, withBackoff } from '@/lib/calendar';

describe('classifyGoogleError', () => {
  it('maps 401 to auth / not retryable', () => {
    const info = classifyGoogleError({ code: 401, message: 'invalid_token' });
    expect(info).toMatchObject({ code: 'auth', retryable: false, status: 401 });
  });

  it('maps 404 to not_found / not retryable', () => {
    const info = classifyGoogleError({ code: 404 });
    expect(info).toMatchObject({ code: 'not_found', retryable: false });
  });

  it('maps 410 to not_found (gone)', () => {
    const info = classifyGoogleError({ status: 410 });
    expect(info).toMatchObject({ code: 'not_found', retryable: false, status: 410 });
  });

  it('maps 412 to precondition_failed / retryable once', () => {
    const info = classifyGoogleError({ code: 412 });
    expect(info).toMatchObject({ code: 'precondition_failed', retryable: true });
  });

  it('maps 429 to rate_limited / retryable', () => {
    const info = classifyGoogleError({ code: 429 });
    expect(info).toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('maps 5xx to transient / retryable', () => {
    expect(classifyGoogleError({ code: 503 }).code).toBe('transient');
    expect(classifyGoogleError({ code: 500 }).retryable).toBe(true);
  });

  it('maps unknown status to unknown / not retryable', () => {
    const info = classifyGoogleError({ code: 418 });
    expect(info).toMatchObject({ code: 'unknown', retryable: false });
  });

  it('treats network errors (no status) as transient', () => {
    const info = classifyGoogleError(new Error('ECONNRESET'));
    expect(info).toMatchObject({ code: 'transient', retryable: true });
    expect(info.status).toBeUndefined();
  });

  it('reads status from response.status when code/status missing', () => {
    const info = classifyGoogleError({ response: { status: 429 } });
    expect(info.code).toBe('rate_limited');
  });
});

describe('withBackoff', () => {
  it('returns the value on first success with no retries', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withBackoff(fn, 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error('rate'), { code: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('rate'), { code: 429 }))
      .mockResolvedValueOnce('ok');

    const promise = withBackoff(fn, 'test');
    // Let the setTimeout callbacks fire without waiting real time.
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('retries on 5xx then throws after exhausting attempts', async () => {
    vi.useFakeTimers();
    const err = Object.assign(new Error('boom'), { code: 503 });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    const promise = withBackoff(fn, 'test').catch((e) => e);
    await vi.runAllTimersAsync();
    const caught = await promise;
    expect(caught).toBe(err);
    // 4 delays configured + 1 initial attempt = 5 total
    expect(fn).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });

  it('does not retry on non-retryable status (e.g., 404)', async () => {
    const err = Object.assign(new Error('missing'), { code: 404 });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);
    await expect(withBackoff(fn, 'test')).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After header (seconds) when present', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const err = Object.assign(new Error('rate'), {
      code: 429,
      response: { headers: { 'retry-after': '7' } },
    });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const promise = withBackoff(fn, 'test');
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    // setTimeout should have been called with 7000 ms (from Retry-After: 7 seconds)
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toContain(7000);
    vi.useRealTimers();
  });
});
