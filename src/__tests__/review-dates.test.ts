import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextReviewDate } from '@/lib/review-dates';

describe('getNextReviewDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('WEEKLY', () => {
    it('returns one week from today', () => {
      // Wednesday, March 18, 2026
      vi.setSystemTime(new Date('2026-03-18T10:00:00Z'));
      const result = getNextReviewDate('WEEKLY');
      expect(result.getDate()).toBe(25); // Wednesday March 25
    });

    it('returns one week from Friday', () => {
      // Friday, March 27, 2026
      vi.setSystemTime(new Date('2026-03-27T10:00:00Z'));
      const result = getNextReviewDate('WEEKLY');
      expect(result.getDate()).toBe(3); // Friday April 3
      expect(result.getDay()).toBe(5); // Friday
    });
  });

  describe('MONTHLY', () => {
    it('returns first day of next month', () => {
      vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));
      const result = getNextReviewDate('MONTHLY');
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(1);
    });
  });

  describe('YEARLY', () => {
    it('returns January 1 of next year', () => {
      vi.setSystemTime(new Date('2026-06-01T10:00:00Z'));
      const result = getNextReviewDate('YEARLY');
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2027);
    });
  });

  describe('unknown type', () => {
    it('defaults to 1 week from now', () => {
      vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));
      const result = getNextReviewDate('UNKNOWN');
      const expected = new Date('2026-03-22T10:00:00Z');
      expect(result.toISOString().split('T')[0]).toBe(expected.toISOString().split('T')[0]);
    });
  });
});
