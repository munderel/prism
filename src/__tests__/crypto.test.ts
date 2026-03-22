import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64)); // 32 bytes hex

import { encryptToken, decryptToken } from '@/lib/crypto';

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
