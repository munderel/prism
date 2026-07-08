import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Verifies the Resend timeout guard added to sendEmailMessage: a Resend send
 * that never resolves must surface as an EmailDeliveryResult
 * { sent:false, error:'Resend timed out' } within the 15s race window rather
 * than hanging the awaiting caller. Uses fake timers so the 15s is instant.
 */

// A resend.emails.send that never settles, simulating a hung upstream.
const neverResolvingSend = vi.fn(() => new Promise(() => {}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: neverResolvingSend };
  },
}));

// prisma is imported transitively by notifications.ts; stub it so the module
// loads without a DB connection. Only the email path is exercised here.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

describe('sendEmailMessage Resend timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.RESEND_API_KEY = 'test-key';
    neverResolvingSend.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it('returns sent:false / Resend timed out when the send never resolves', async () => {
    const { sendTestEmail } = await import('@/lib/notifications');

    const resultPromise = sendTestEmail('user@example.com');
    // Advance past the 15s race window.
    await vi.advanceTimersByTimeAsync(15000);

    const result = await resultPromise;
    expect(result).toEqual({ configured: true, sent: false, error: 'Resend timed out' });
    expect(neverResolvingSend).toHaveBeenCalledTimes(1);
  });
});
