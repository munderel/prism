import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetcher, freshFetcher } from '@/lib/fetcher';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetcher / freshFetcher error detail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('freshFetcher surfaces the server error message (parity with fetcher)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: 'Title is required' })) as unknown as typeof fetch;

    await expect(freshFetcher('/api/goals')).rejects.toThrow(/Title is required/);
    await expect(freshFetcher('/api/goals')).rejects.toThrow(/400/);
  });

  it('fetcher surfaces the server error message', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: 'Title is required' })) as unknown as typeof fetch;

    await expect(fetcher('/api/goals')).rejects.toThrow(/Title is required/);
  });

  it('falls back to the bare status when the body has no error/message', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 503 })) as unknown as typeof fetch;

    await expect(freshFetcher('/api/goals')).rejects.toThrow(/API error: 503/);
  });

  it('returns parsed JSON on success', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true })) as unknown as typeof fetch;

    await expect(freshFetcher('/api/goals')).resolves.toEqual({ ok: true });
  });
});
