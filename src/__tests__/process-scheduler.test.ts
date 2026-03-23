import { describe, it, expect } from 'vitest';
import { computeNextDueDate } from '@/lib/process-scheduler';

describe('computeNextDueDate', () => {
  const base = new Date('2026-03-15T10:00:00Z');

  it('DAILY adds 1 day', () => {
    const result = computeNextDueDate('DAILY', base);
    expect(result.toISOString().split('T')[0]).toBe('2026-03-16');
  });

  it('WEEKLY adds 7 days', () => {
    const result = computeNextDueDate('WEEKLY', base);
    expect(result.toISOString().split('T')[0]).toBe('2026-03-22');
  });

  it('BIWEEKLY adds 14 days', () => {
    const result = computeNextDueDate('BIWEEKLY', base);
    expect(result.toISOString().split('T')[0]).toBe('2026-03-29');
  });

  it('MONTHLY adds 1 month', () => {
    const result = computeNextDueDate('MONTHLY', base);
    expect(result.toISOString().split('T')[0]).toBe('2026-04-15');
  });

  it('MONTHLY handles end-of-month correctly (Jan 31 -> Feb 28)', () => {
    const jan31 = new Date('2026-01-31T10:00:00Z');
    const result = computeNextDueDate('MONTHLY', jan31);
    // date-fns addMonths clamps to last day of February
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBeLessThanOrEqual(28);
  });

  it('QUARTERLY adds 3 months', () => {
    const result = computeNextDueDate('QUARTERLY', base);
    expect(result.toISOString().split('T')[0]).toBe('2026-06-15');
  });

  it('YEARLY adds 1 year', () => {
    const result = computeNextDueDate('YEARLY', base);
    expect(result.toISOString().split('T')[0]).toBe('2027-03-15');
  });
});
