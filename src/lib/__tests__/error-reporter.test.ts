import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const errorSpy = vi.fn();
vi.mock('../logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: errorSpy,
  })),
  // Faithful-enough shallow stand-in for the real redactSecrets so the webhook
  // payload assertions exercise redaction without importing the mocked module.
  redactSecrets: (v: unknown) => {
    if (!v || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = /token|secret|authorization|password/i.test(k) ? '[REDACTED]' : val;
    }
    return out;
  },
}));

import { reportError } from '../error-reporter';
import { createLogger } from '../logger';

describe('reportError', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALERT_WEBHOOK_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('logs the error message + stack via the structured logger', async () => {
    const err = new Error('boom');
    await reportError('cron/test', err, { userId: 'u1' });

    expect(createLogger).toHaveBeenCalledWith('cron/test');
    expect(errorSpy).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({ userId: 'u1', stack: err.stack }),
    );
  });

  it('stringifies non-Error values', async () => {
    await reportError('api', 'plain string failure');
    expect(errorSpy).toHaveBeenCalledWith(
      'plain string failure',
      expect.objectContaining({ stack: undefined }),
    );
  });

  it('does not POST when ALERT_WEBHOOK_URL is unset', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await reportError('api', new Error('x'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a compact payload to ALERT_WEBHOOK_URL when set', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/incident';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportError('api', new Error('kaboom'), { route: '/api/tasks' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example/incident');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      context: 'api',
      message: 'kaboom',
      meta: { route: '/api/tasks' },
    });
    expect(typeof payload.time).toBe('string');
  });

  it('redacts secret-bearing meta keys in the webhook payload', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/incident';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportError('api', new Error('kaboom'), { route: '/api/tasks', token: 'sk-live-secret' });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.meta.route).toBe('/api/tasks');
    expect(payload.meta.token).toBe('[REDACTED]');
  });

  it('swallows a webhook fetch rejection and still logs', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example/incident';
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(reportError('api', new Error('inner'))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('inner', expect.objectContaining({ stack: expect.any(String) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
