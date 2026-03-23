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
    it('returns next Sunday', () => {
      // Wednesday, March 18, 2026
      vi.setSystemTime(new Date('2026-03-18T10:00:00Z'));
      const result = getNextReviewDate('WEEKLY');
      expect(result.getDay()).toBe(0); // Sunday
      expect(result >= new Date('2026-03-18')).toBe(true);
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

  describe('QUARTERLY', () => {
    it('in January returns April 1', () => {
      vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2026);
    });

    it('in April returns July 1', () => {
      vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(6); // July
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2026);
    });

    it('in July returns October 1', () => {
      vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(9); // October
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2026);
    });

    it('in October returns January 1 of next year', () => {
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2027);
    });

    it('in November returns January 1 of next year', () => {
      vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2027);
    });

    it('in December returns January 1 of next year', () => {
      vi.setSystemTime(new Date('2026-12-15T10:00:00Z'));
      const result = getNextReviewDate('QUARTERLY');
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
      expect(result.getFullYear()).toBe(2027);
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
