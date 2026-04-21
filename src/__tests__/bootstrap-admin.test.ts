/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { bootstrapAdmin, validateBootstrapPassword } from '@/lib/bootstrap-admin';

describe('validateBootstrapPassword', () => {
  it('accepts a strong password', () => {
    expect(validateBootstrapPassword('Strong-Passw0rd-x')).toBeNull();
  });

  it.each([
    ['short1A!', 'must be at least 12 characters'],
    ['ALLUPPERCASE12!', 'must contain a lowercase letter'],
    ['alllowercase12!', 'must contain an uppercase letter'],
    ['NoDigitsHereX!!', 'must contain a digit'],
    ['NoSpecialChars12', 'must contain a special character'],
  ])('rejects %s', (password, expectedMessage) => {
    expect(validateBootstrapPassword(password)).toBe(expectedMessage);
  });
});

function makeTxMock(behavior: {
  findFirstAdmin?: { id: string; email: string } | null;
  findUniqueUser?: { id: string; email: string } | null;
  updateResult?: { id: string; email: string };
  createResult?: { id: string; email: string };
}) {
  const $executeRaw = vi.fn().mockResolvedValue(1);
  const findFirst = vi.fn().mockResolvedValue(behavior.findFirstAdmin ?? null);
  const findUnique = vi.fn().mockResolvedValue(behavior.findUniqueUser ?? null);
  const update = vi.fn().mockResolvedValue(behavior.updateResult ?? { id: 'u1', email: 'x@x' });
  const create = vi.fn().mockResolvedValue(behavior.createResult ?? { id: 'u-new', email: 'x@x' });
  const tx = {
    $executeRaw,
    user: { findFirst, findUnique, update, create },
  };
  const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  return { tx, $executeRaw, findFirst, findUnique, update, create, client: { $transaction } };
}

describe('bootstrapAdmin', () => {
  const validInput = { email: ' Test@Example.com ', password: 'Strong-Passw0rd-x' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a weak password before touching the DB', async () => {
    const { client } = makeTxMock({});
    await expect(
      bootstrapAdmin(client as any, { email: 'x@y.com', password: 'weak' }),
    ).rejects.toThrow(/must be at least 12 characters/);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('takes an advisory lock before reading admin state', async () => {
    const { client, $executeRaw, findFirst } = makeTxMock({
      createResult: { id: 'u-new', email: 'test@example.com' },
    });
    await bootstrapAdmin(client as any, validInput);
    expect($executeRaw).toHaveBeenCalled();
    // Advisory lock runs before the findFirst
    const lockOrder = $executeRaw.mock.invocationCallOrder[0];
    const findOrder = findFirst.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(findOrder);
  });

  it('returns already-exists when an admin is present (idempotent re-run)', async () => {
    const { client, create } = makeTxMock({
      findFirstAdmin: { id: 'a1', email: 'existing-admin@x.com' },
    });
    const result = await bootstrapAdmin(client as any, validInput);
    expect(result).toEqual({ status: 'already-exists', email: 'existing-admin@x.com' });
    expect(create).not.toHaveBeenCalled();
  });

  it('promotes an existing non-admin user with the same email', async () => {
    const { client, update, create } = makeTxMock({
      findFirstAdmin: null,
      findUniqueUser: { id: 'u-existing', email: 'test@example.com' },
      updateResult: { id: 'u-existing', email: 'test@example.com' },
    });
    const result = await bootstrapAdmin(client as any, validInput);
    expect(result).toEqual({ status: 'promoted', email: 'test@example.com' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-existing' },
        data: expect.objectContaining({ isAdmin: true }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the admin when no admin and no user exist', async () => {
    const { client, create } = makeTxMock({
      findFirstAdmin: null,
      findUniqueUser: null,
      createResult: { id: 'u-new', email: 'test@example.com' },
    });
    const result = await bootstrapAdmin(client as any, validInput);
    expect(result).toEqual({ status: 'created', email: 'test@example.com' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'test@example.com', isAdmin: true }),
      }),
    );
  });

  it('normalizes email (trim + lowercase) before use', async () => {
    const { client, findUnique } = makeTxMock({});
    await bootstrapAdmin(client as any, { email: '  MixEd@CASE.com ', password: validInput.password });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'mixed@case.com' } });
  });

  it('bcrypt-hashes the password before persisting', async () => {
    const { client, create } = makeTxMock({ createResult: { id: 'u-new', email: 'x@x' } });
    await bootstrapAdmin(client as any, validInput);
    const hashed = (create.mock.calls[0][0] as any).data.passwordHash;
    expect(hashed).not.toBe(validInput.password);
    expect(await bcrypt.compare(validInput.password, hashed)).toBe(true);
  });
});
