import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { conditionalUpdate, advisoryLock } from '@/lib/concurrency';

describe('conditionalUpdate', () => {
  it('returns true when exactly one row matched', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const model = { updateMany };
    const args = { where: { id: 'r1', completedAt: null }, data: { completedAt: new Date() } };
    const won = await conditionalUpdate(model, args);
    expect(won).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(args);
  });

  it('returns false when zero rows matched (lost the race)', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const won = await conditionalUpdate({ updateMany }, { where: { id: 'r1' }, data: {} });
    expect(won).toBe(false);
  });

  it('returns false when the predicate accidentally matches more than one row', async () => {
    // Defensive: count > 1 means the predicate wasn't unique enough.
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const won = await conditionalUpdate({ updateMany }, { where: {}, data: {} });
    expect(won).toBe(false);
  });

  it('propagates underlying errors', async () => {
    const updateMany = vi.fn().mockRejectedValue(new Error('db gone'));
    await expect(conditionalUpdate({ updateMany }, {})).rejects.toThrow('db gone');
  });
});

describe('advisoryLock', () => {
  function mockTx() {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: executeRaw };
    const $transaction = vi.fn(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    return { tx, executeRaw, client: { $transaction } as unknown as Parameters<typeof advisoryLock>[2] };
  }

  it('takes a bigint advisory lock for numeric keys', async () => {
    const { executeRaw, client } = mockTx();
    const result = await advisoryLock(42, async () => 'ok', client!);
    expect(result).toBe('ok');
    expect(executeRaw).toHaveBeenCalledOnce();
    const [strings, ...values] = executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(values).toEqual([BigInt(42)]);
  });

  it('hashes string keys via hashtext so identical keys serialize', async () => {
    const { executeRaw, client } = mockTx();
    await advisoryLock('process-gen:abc', async () => undefined, client!);
    const [strings, ...values] = executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('hashtext');
    expect(values).toEqual(['process-gen:abc']);
  });

  it('passes the transaction client into the callback', async () => {
    const { tx, client } = mockTx();
    const inner = vi.fn().mockResolvedValue('done');
    const out = await advisoryLock('k', inner, client!);
    expect(out).toBe('done');
    expect(inner).toHaveBeenCalledWith(tx);
  });

  it('propagates errors thrown by the callback so the transaction rolls back', async () => {
    const { client } = mockTx();
    await expect(
      advisoryLock('k', async () => {
        throw new Error('boom');
      }, client!),
    ).rejects.toThrow('boom');
  });
});
