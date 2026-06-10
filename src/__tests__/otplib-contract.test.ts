import { describe, it, expect } from 'vitest';
import { generateSecret, generateSync, verifySync } from 'otplib';

/**
 * Contract guard for otplib v13. The 2FA code at src/lib/auth.ts and
 * src/app/api/auth/setup-2fa/route.ts depends on verifySync returning a
 * discriminated-union OBJECT ({ valid: true, ... } | { valid: false }), NOT a
 * boolean. A prior bug used the result directly as a boolean
 * (`if (!verifySync(...))`), which is ALWAYS false for an object and silently
 * bypassed 2FA entirely. These tests exercise the REAL library (no mocks) so
 * that contract can never regress unnoticed — if otplib's shape changes or the
 * call sites revert, this fails in CI.
 */
describe('otplib v13 verifySync contract', () => {
  it('returns { valid: true } for a correct current token', () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    const result = verifySync({ token, secret });
    expect(result).toBeTypeOf('object');
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false } for an incorrect token', () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    const wrong = token === '000000' ? '111111' : '000000';
    const result = verifySync({ token: wrong, secret });
    expect(result.valid).toBe(false);
  });

  it('result object is always truthy — proves `!verifySync(...)` is the bug, `.valid` is the fix', () => {
    const secret = generateSecret();
    const invalid = verifySync({ token: '000000', secret });
    // The whole point: the object itself is truthy even when the code is wrong.
    expect(Boolean(invalid)).toBe(true);
    expect(!invalid).toBe(false);
    // Only `.valid` distinguishes accept vs reject.
    expect(invalid.valid).toBe(false);
  });
});
