import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: (args: unknown) => create(args),
    },
  },
}));

import { writeAuditLog, extractRequestMeta } from '@/lib/audit-log';

describe('writeAuditLog', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('inserts a row with all fields threaded through', async () => {
    create.mockResolvedValue({ id: 'a1' });
    await writeAuditLog({
      action: 'task.bulk_delete',
      targetType: 'Task',
      targetId: 't1',
      actorId: 'u1',
      ip: '1.2.3.4',
      userAgent: 'vitest',
      metadata: { ids: ['t1', 't2'] },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [{ data }] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.action).toBe('task.bulk_delete');
    expect(data.targetType).toBe('Task');
    expect(data.targetId).toBe('t1');
    expect(data.actorId).toBe('u1');
    expect(data.ip).toBe('1.2.3.4');
    expect(data.userAgent).toBe('vitest');
    expect(data.metadata).toEqual({ ids: ['t1', 't2'] });
  });

  it('swallows DB errors so callers are never blocked', async () => {
    create.mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      writeAuditLog({ action: 'test', targetType: 'Test' }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('defaults optional fields to null', async () => {
    create.mockResolvedValue({ id: 'a2' });
    await writeAuditLog({ action: 'x', targetType: 'Y' });
    const [{ data }] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.targetId).toBeNull();
    expect(data.actorId).toBeNull();
    expect(data.ip).toBeNull();
    expect(data.userAgent).toBeNull();
  });
});

describe('extractRequestMeta', () => {
  it('prefers x-forwarded-for first hop, falls back to x-real-ip', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2', 'user-agent': 'ua-1' },
    });
    expect(extractRequestMeta(req)).toEqual({ ip: '1.1.1.1', userAgent: 'ua-1' });
  });

  it('returns nulls when headers are absent', () => {
    const req = new Request('https://example.com');
    expect(extractRequestMeta(req)).toEqual({ ip: null, userAgent: null });
  });

  it('uses x-real-ip when x-forwarded-for is missing', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '3.3.3.3' },
    });
    expect(extractRequestMeta(req).ip).toBe('3.3.3.3');
  });
});
