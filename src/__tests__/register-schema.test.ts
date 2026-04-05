import { describe, it, expect } from 'vitest';
import { registerSchema } from '@/lib/schemas';

const validInput = {
  email: 'user@example.com',
  password: 'Str0ng!Pass99',
  invitationId: 'inv-123',
};

describe('registerSchema', () => {
  it('accepts valid minimal input', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid input with optional name', () => {
    const result = registerSchema.safeParse({ ...validInput, name: 'John' });
    expect(result.success).toBe(true);
  });

  it('accepts password exactly 12 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'Abcdefghij1!' });
    expect(result.success).toBe(true);
  });

  it('rejects password with 11 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'Abcdefghi1!' });
    expect(result.success).toBe(false);
  });

  it('rejects password missing lowercase letter', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'ABCDEFGHIJ1!' });
    expect(result.success).toBe(false);
  });

  it('rejects password missing uppercase letter', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'abcdefghij1!' });
    expect(result.success).toBe(false);
  });

  it('rejects password missing digit', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'Abcdefghijk!' });
    expect(result.success).toBe(false);
  });

  it('rejects password missing special character', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'Abcdefghijk1' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects empty invitationId', () => {
    const result = registerSchema.safeParse({ ...validInput, invitationId: '' });
    expect(result.success).toBe(false);
  });

  it('accepts unicode special characters in password', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'Abcdefghij1€' });
    expect(result.success).toBe(true);
  });

  it('strips extra fields', () => {
    const result = registerSchema.safeParse({ ...validInput, extraField: 'should-be-stripped' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extraField).toBeUndefined();
    }
  });
});
