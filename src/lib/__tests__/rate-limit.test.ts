/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rateLimitEvent: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { enforceRateLimit, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS } from '@/lib/rate-limit';

const mockCount = vi.mocked(prisma.rateLimitEvent.count);
const mockCreate = vi.mocked(prisma.rateLimitEvent.create);
const mockDeleteMany = vi.mocked(prisma.rateLimitEvent.deleteMany);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
  // Keep the ~1% opportunistic cleanup path OFF unless a test opts in.
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  mockCreate.mockResolvedValue({} as any);
  mockDeleteMany.mockResolvedValue({ count: 0 } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('enforceRateLimit', () => {
  it('allows a call under the limit and records one event', async () => {
    mockCount.mockResolvedValue(WRITE_RATE_LIMIT - 1);
    const res = await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(res).toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({ data: { key: 'tasks:user-1' } });
  });

  it('returns a 429 Response (and records nothing) once the limit is reached', async () => {
    // The 121st call within the window: 120 events already recorded.
    mockCount.mockResolvedValue(WRITE_RATE_LIMIT);
    const res = await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toMatch(/rate limit/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('counts only events inside the sliding window (window expiry resets the budget)', async () => {
    mockCount.mockResolvedValue(0);
    await enforceRateLimit('goals:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(mockCount).toHaveBeenCalledWith({
      where: {
        key: 'goals:user-1',
        createdAt: { gte: new Date(Date.now() - WRITE_RATE_WINDOW_MS) },
      },
    });

    // Advance past the window: the gte cutoff moves forward, so events that
    // tripped the limit before are no longer counted and the call is allowed.
    vi.advanceTimersByTime(WRITE_RATE_WINDOW_MS + 1000);
    mockCount.mockResolvedValue(0); // old rows fell out of the window
    const res = await enforceRateLimit('goals:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(res).toBeNull();
    expect(mockCount).toHaveBeenLastCalledWith({
      where: {
        key: 'goals:user-1',
        createdAt: { gte: new Date(Date.now() - WRITE_RATE_WINDOW_MS) },
      },
    });
  });

  it('opportunistically deletes events older than 24h on ~1% of allowed calls', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    mockCount.mockResolvedValue(0);
    const res = await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(res).toBeNull();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  });

  it('swallows cleanup failures — a failed sweep never blocks the request', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    mockCount.mockResolvedValue(0);
    mockDeleteMany.mockRejectedValue(new Error('db hiccup'));
    const res = await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(res).toBeNull();
  });

  it('skips cleanup on the other ~99% of calls', async () => {
    mockCount.mockResolvedValue(0);
    await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('keys are independent per route and user', async () => {
    mockCount.mockResolvedValue(WRITE_RATE_LIMIT); // user-1 is maxed out on tasks
    const limited = await enforceRateLimit('tasks:user-1', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(limited!.status).toBe(429);

    mockCount.mockResolvedValue(0); // a different key has its own budget
    const allowed = await enforceRateLimit('goals:user-2', WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    expect(allowed).toBeNull();
    expect(mockCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'goals:user-2' }) })
    );
  });
});
