/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkLockout,
  recordLoginAttempt,
  MAX_FAILURES,
  FAILURE_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from '@/lib/login-lockout';

function makePrisma(behavior?: {
  userRow?: { id: string; isLockedOut: boolean; lockoutUntil: Date | null } | null;
  failureCount?: number;
}) {
  const userFindUnique = vi.fn().mockResolvedValue(behavior?.userRow ?? null);
  const userUpdate = vi.fn().mockResolvedValue({});
  const attemptCreate = vi.fn().mockResolvedValue({ id: 'att-1' });
  const attemptCount = vi.fn().mockResolvedValue(behavior?.failureCount ?? 0);
  return {
    prisma: {
      user: { findUnique: userFindUnique, update: userUpdate },
      loginAttempt: { count: attemptCount, create: attemptCreate },
    } as any,
    userFindUnique,
    userUpdate,
    attemptCreate,
    attemptCount,
  };
}

describe('checkLockout', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('returns unlocked when the user does not exist', async () => {
    const { prisma, userUpdate } = makePrisma({ userRow: null });
    expect(await checkLockout(prisma, 'ghost@x.com', now)).toEqual({ locked: false });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('returns unlocked when isLockedOut is false', async () => {
    const { prisma } = makePrisma({
      userRow: { id: 'u1', isLockedOut: false, lockoutUntil: null },
    });
    expect(await checkLockout(prisma, 'u@x', now)).toEqual({ locked: false });
  });

  it('returns locked when lockoutUntil is still in the future', async () => {
    const future = new Date(now.getTime() + 5 * 60 * 1000);
    const { prisma, userUpdate } = makePrisma({
      userRow: { id: 'u1', isLockedOut: true, lockoutUntil: future },
    });
    const result = await checkLockout(prisma, 'u@x', now);
    expect(result.locked).toBe(true);
    expect(result.until).toEqual(future);
    expect(userUpdate).not.toHaveBeenCalled(); // lock still active; don't clear
  });

  it('auto-clears an expired lockout and returns unlocked', async () => {
    const past = new Date(now.getTime() - 1);
    const { prisma, userUpdate } = makePrisma({
      userRow: { id: 'u1', isLockedOut: true, lockoutUntil: past },
    });
    const result = await checkLockout(prisma, 'u@x', now);
    expect(result).toEqual({ locked: false });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isLockedOut: false, lockoutUntil: null },
    });
  });

  it('treats null lockoutUntil on a locked user as expired (auto-clears)', async () => {
    const { prisma, userUpdate } = makePrisma({
      userRow: { id: 'u1', isLockedOut: true, lockoutUntil: null },
    });
    const result = await checkLockout(prisma, 'u@x', now);
    expect(result).toEqual({ locked: false });
    expect(userUpdate).toHaveBeenCalled();
  });
});

describe('recordLoginAttempt', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  beforeEach(() => vi.clearAllMocks());

  it('writes a LoginAttempt row on every call', async () => {
    const { prisma, attemptCreate } = makePrisma();
    await recordLoginAttempt(prisma, { email: 'a@x', success: true }, now);
    expect(attemptCreate).toHaveBeenCalledWith({
      data: { email: 'a@x', success: true, createdAt: now },
    });
  });

  it('success does not touch user lockout state', async () => {
    const { prisma, userUpdate, attemptCount } = makePrisma();
    const r = await recordLoginAttempt(prisma, { email: 'a@x', success: true }, now);
    expect(r).toEqual({ locked: false });
    expect(attemptCount).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('failure below MAX_FAILURES does not lock', async () => {
    const { prisma, userUpdate } = makePrisma({ failureCount: MAX_FAILURES - 1 });
    const r = await recordLoginAttempt(prisma, { email: 'a@x', success: false }, now);
    expect(r).toEqual({ locked: false });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('failure crossing MAX_FAILURES locks the user with lockoutUntil', async () => {
    const { prisma, userFindUnique, userUpdate } = makePrisma({
      userRow: { id: 'u1', isLockedOut: false, lockoutUntil: null },
      failureCount: MAX_FAILURES,
    });
    userFindUnique.mockResolvedValueOnce({ id: 'u1' });
    const r = await recordLoginAttempt(prisma, { email: 'a@x', success: false }, now);
    expect(r.locked).toBe(true);
    expect(r.until?.getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MS);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ isLockedOut: true }),
    });
  });

  it('failure threshold queries only the last FAILURE_WINDOW_MS', async () => {
    const { prisma, attemptCount } = makePrisma({ failureCount: 1 });
    await recordLoginAttempt(prisma, { email: 'a@x', success: false }, now);
    const arg = attemptCount.mock.calls[0][0] as any;
    expect(arg.where.email).toBe('a@x');
    expect(arg.where.success).toBe(false);
    const since = arg.where.createdAt.gte as Date;
    expect(now.getTime() - since.getTime()).toBe(FAILURE_WINDOW_MS);
  });

  it('unknown email at threshold does not try to lock a phantom user', async () => {
    const { prisma, userFindUnique, userUpdate } = makePrisma({
      userRow: null,
      failureCount: MAX_FAILURES,
    });
    userFindUnique.mockResolvedValueOnce(null);
    const r = await recordLoginAttempt(prisma, { email: 'ghost@x', success: false }, now);
    expect(r).toEqual({ locked: false });
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
