import { describe, it, expect } from 'vitest';

// Test email validation logic (same regex used in the API endpoints)
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

describe('invitation email validation', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('admin@upwhiten.com')).toBe(true);
    expect(isValidEmail('test.user@company.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@no-local.com')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
  });
});

describe('invitation role validation', () => {
  const validRoles = ['admin', 'user'];

  it('accepts valid roles', () => {
    expect(validRoles.includes('admin')).toBe(true);
    expect(validRoles.includes('user')).toBe(true);
  });

  it('rejects invalid roles', () => {
    expect(validRoles.includes('superadmin')).toBe(false);
    expect(validRoles.includes('')).toBe(false);
    expect(validRoles.includes('ADMIN')).toBe(false);
  });
});

describe('email normalization', () => {
  it('normalizes emails to lowercase', () => {
    expect('Admin@UpWhiten.COM'.toLowerCase()).toBe('admin@upwhiten.com');
    expect('USER@Example.Com'.toLowerCase()).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    expect('  admin@upwhiten.com  '.trim().toLowerCase()).toBe('admin@upwhiten.com');
  });

  it('matches case-insensitively after normalization', () => {
    const storedEmail = 'admin@upwhiten.com';
    const inputEmail = 'Admin@UpWhiten.COM';
    expect(inputEmail.trim().toLowerCase()).toBe(storedEmail);
  });
});
