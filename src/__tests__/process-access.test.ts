/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canAccessProcess,
  processAccessWhere,
  authorizeProcessAccess,
} from '@/lib/api-helpers';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    process: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
const mockProcessFindUnique = vi.mocked(prisma.process.findUnique);

beforeEach(() => {
  mockProcessFindUnique.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-24T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('canAccessProcess', () => {
  const future = new Date('2026-05-01T00:00:00Z');
  const past = new Date('2026-04-01T00:00:00Z');

  it('admins always have access', () => {
    const proc = { assigneeId: 'other', delegateId: null, delegateUntil: null };
    expect(canAccessProcess(proc, 'me', true)).toBe(true);
  });

  it('the assignee has access', () => {
    const proc = { assigneeId: 'me', delegateId: null, delegateUntil: null };
    expect(canAccessProcess(proc, 'me', false)).toBe(true);
  });

  it('a delegate with future delegateUntil has access', () => {
    const proc = { assigneeId: 'other', delegateId: 'me', delegateUntil: future };
    expect(canAccessProcess(proc, 'me', false)).toBe(true);
  });

  it('a delegate with expired delegateUntil does NOT have access', () => {
    const proc = { assigneeId: 'other', delegateId: 'me', delegateUntil: past };
    expect(canAccessProcess(proc, 'me', false)).toBe(false);
  });

  it('a delegate with null delegateUntil does NOT have access', () => {
    const proc = { assigneeId: 'other', delegateId: 'me', delegateUntil: null };
    expect(canAccessProcess(proc, 'me', false)).toBe(false);
  });

  it('an unrelated user does NOT have access', () => {
    const proc = { assigneeId: 'other1', delegateId: 'other2', delegateUntil: future };
    expect(canAccessProcess(proc, 'me', false)).toBe(false);
  });

  it('a process with no assignee or delegate is not accessible to non-admins', () => {
    const proc = { assigneeId: null, delegateId: null, delegateUntil: null };
    expect(canAccessProcess(proc, 'me', false)).toBe(false);
  });

  it('a process with no assignee or delegate IS accessible to admins', () => {
    const proc = { assigneeId: null, delegateId: null, delegateUntil: null };
    expect(canAccessProcess(proc, 'me', true)).toBe(true);
  });
});

describe('processAccessWhere', () => {
  it('returns an empty filter for admins', () => {
    expect(processAccessWhere('me', true)).toEqual({});
  });

  it('returns an OR filter scoping to assignee or active delegate for non-admins', () => {
    const result = processAccessWhere('me', false);
    expect(result).toEqual({
      OR: [
        { assigneeId: 'me' },
        { delegateId: 'me', delegateUntil: { gte: expect.any(Date) } },
      ],
    });
  });
});

describe('authorizeProcessAccess', () => {
  it('returns 404 when the process is not found', async () => {
    mockProcessFindUnique.mockResolvedValue(null);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(404);
  });

  it('grants admins access to any process', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'other',
      delegateId: null,
      delegateUntil: null,
    } as any);
    const result = await authorizeProcessAccess('p1', 'admin', true);
    expect(result.process).toBeDefined();
    expect(result.process!.id).toBe('p1');
  });

  it('grants the assignee access', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'me',
      delegateId: null,
      delegateUntil: null,
    } as any);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.process).toBeDefined();
  });

  it('grants an active delegate access', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'other',
      delegateId: 'me',
      delegateUntil: new Date('2026-05-01T00:00:00Z'),
    } as any);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.process).toBeDefined();
  });

  it('denies an expired delegate (delegateUntil in the past)', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'other',
      delegateId: 'me',
      delegateUntil: new Date('2026-04-01T00:00:00Z'),
    } as any);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(403);
  });

  it('denies a delegate with null delegateUntil', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'other',
      delegateId: 'me',
      delegateUntil: null,
    } as any);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(403);
  });

  it('denies an unrelated user', async () => {
    mockProcessFindUnique.mockResolvedValue({
      id: 'p1',
      assigneeId: 'other1',
      delegateId: 'other2',
      delegateUntil: new Date('2026-05-01T00:00:00Z'),
    } as any);
    const result = await authorizeProcessAccess('p1', 'me', false);
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(403);
  });
});
