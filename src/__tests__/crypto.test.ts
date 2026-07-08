import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64)); // 32 bytes hex

import {
  encryptToken,
  decryptToken,
  encryptTokenWithKey,
  decryptTokenWithKey,
} from '@/lib/crypto';

describe('token encryption', () => {
  it('encrypts and decrypts a token back to the original', () => {
    const original = 'my-secret-refresh-token-1234';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext format
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for the same input (random IV)', () => {
    const original = 'same-token';
    const a = encryptToken(original);
    const b = encryptToken(original);
    expect(a).not.toBe(b);
  });

  it('returns null for invalid ciphertext', () => {
    expect(decryptToken('not-valid')).toBeNull();
    expect(decryptToken('abc:def')).toBeNull();
  });
});

describe('key rotation (scripts/rotate-token-key.ts path)', () => {
  const keyA = 'a'.repeat(64); // matches the stubbed TOKEN_ENCRYPTION_KEY
  const keyB = 'b'.repeat(64);

  it('rotates: encrypt with key A, decrypt with A, re-encrypt with B, decrypt with B round-trips', () => {
    const original = 'refresh-token-to-rotate';
    const underA = encryptToken(original); // env key = key A

    // Wrong key must not decrypt (and must not throw)
    expect(decryptTokenWithKey(underA, keyB)).toBeNull();

    const plaintext = decryptTokenWithKey(underA, keyA);
    expect(plaintext).toBe(original);

    const underB = encryptTokenWithKey(plaintext!, keyB);
    expect(underB.split(':').length).toBe(3);
    expect(decryptTokenWithKey(underB, keyB)).toBe(original);
    expect(decryptTokenWithKey(underB, keyA)).toBeNull();
  });

  it('backfills: plaintext input gets encrypted and round-trips', () => {
    const plaintext = 'legacy-plaintext-refresh-token'; // no colons — pre-migration shape
    expect(plaintext.includes(':')).toBe(false);

    const encrypted = encryptTokenWithKey(plaintext, keyB);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':').length).toBe(3);
    expect(decryptTokenWithKey(encrypted, keyB)).toBe(plaintext);
  });

  it('rejects a malformed key hex', () => {
    expect(() => encryptTokenWithKey('x', 'too-short')).toThrow();
    expect(decryptTokenWithKey(encryptToken('x'), 'too-short')).toBeNull();
  });
});
