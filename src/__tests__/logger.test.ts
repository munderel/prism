import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, redactSecrets } from '@/lib/logger';

describe('redactSecrets', () => {
  it('redacts top-level sensitive keys case-insensitively', () => {
    const input = {
      userId: 'u1',
      password: 'hunter2',
      accessToken: 'at-123',
      refresh_token: 'rt-123',
      TOTPSecret: 'abc',
      cookie: 'c=1',
      Authorization: 'Bearer xyz',
      safe: 'keep-me',
    };
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(out.password).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out.TOTPSecret).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.userId).toBe('u1');
    expect(out.safe).toBe('keep-me');
  });

  it('redacts nested sensitive keys', () => {
    const input = { user: { id: 'u1', password: 'p' }, session: { refreshToken: 'rt' } };
    const out = redactSecrets(input) as { user: { id: string; password: string }; session: string };
    expect(out.user.password).toBe('[REDACTED]');
    expect(out.user.id).toBe('u1');
    expect(out.session).toBe('[REDACTED]');
  });

  it('passes through primitives and null/undefined', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets('hi')).toBe('hi');
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(true)).toBe(true);
  });

  it('handles arrays', () => {
    const arr = [{ password: 'p' }, { token: 't' }, { ok: 1 }];
    const out = redactSecrets(arr) as Array<Record<string, unknown>>;
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[1].token).toBe('[REDACTED]');
    expect(out[2].ok).toBe(1);
  });

  it('survives circular references without infinite recursion', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const out = redactSecrets(a) as { name: string; self: unknown };
    expect(out.name).toBe('a');
    expect(out.self).toBe('[Circular]');
  });
});

describe('createLogger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('emits JSON in production with redacted meta', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = '';
    const logger = createLogger('auth');
    logger.info('login attempt', { email: 'a@b.c', password: 'secret', ip: '1.2.3.4' });
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call).toBeDefined();
    const record = JSON.parse(call![0] as string);
    expect(record.level).toBe('info');
    expect(record.context).toBe('auth');
    expect(record.msg).toBe('login attempt');
    expect(record.email).toBe('a@b.c');
    expect(record.password).toBe('[REDACTED]');
    expect(record.ip).toBe('1.2.3.4');
    expect(typeof record.time).toBe('string');
  });

  it('routes error() to console.error', () => {
    process.env.NODE_ENV = 'production';
    const logger = createLogger('cron');
    logger.error('job failed', { reason: 'x' });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('routes warn() to console.warn', () => {
    process.env.NODE_ENV = 'production';
    const logger = createLogger('cron');
    logger.warn('slow');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('respects LOG_LEVEL to suppress lower levels', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'warn';
    const logger = createLogger('ctx');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.log).not.toHaveBeenCalled(); // debug + info suppressed
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('emits readable text in non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger('dev');
    logger.info('hello', { a: 1 });
    const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0];
    expect(call![0]).toContain('[info] dev: hello');
  });

  it('default production level is info — debug suppressed', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = '';
    const logger = createLogger('ctx');
    logger.debug('not-shown');
    expect(console.log).not.toHaveBeenCalled();
  });
});
