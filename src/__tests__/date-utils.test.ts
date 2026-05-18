import { describe, it, expect } from 'vitest';
import { eachLocalDateInRange, toDateOnlyInputValue, toLocalDateKey } from '@/lib/date-utils';

describe('eachLocalDateInRange', () => {
  it('returns a single key when start equals end', () => {
    expect(eachLocalDateInRange('2026-04-27', '2026-04-27')).toEqual(['2026-04-27']);
  });

  it('returns inclusive keys across a multi-day range', () => {
    expect(eachLocalDateInRange('2026-04-27', '2026-04-30')).toEqual([
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
  });

  it('returns [] when start is after end', () => {
    expect(eachLocalDateInRange('2026-04-30', '2026-04-27')).toEqual([]);
  });

  it('handles ISO timestamps without UTC off-by-one', () => {
    // A dueDate stored as UTC midnight `2026-03-29T00:00:00.000Z` represents
    // March 29 in the source timezone. In Ottawa (UTC-4 during DST) the
    // wall-clock time is 8pm March 28, but toLocalDateKey already normalises
    // bare ISO Z strings via getLocalDateString. This test guards against a
    // regression where eachLocalDateInRange would shift such inputs by a day.
    const startIso = '2026-03-29T00:00:00.000Z';
    const endIso = '2026-03-29T00:00:00.000Z';
    const startKey = toLocalDateKey(startIso);
    expect(eachLocalDateInRange(startIso, endIso)).toEqual([startKey]);
  });

  it('crosses a DST transition without dropping a day', () => {
    // North American spring-forward transition is March 8, 2026.
    expect(eachLocalDateInRange('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
  });
});

describe('toDateOnlyInputValue', () => {
  // Pairs with parseDateOnly()/formatDateOnly(): date-only fields are stored as
  // UTC midnight, displayed UTC-anchored. This helper produces the YYYY-MM-DD
  // string for an <input type="date"> from a stored value without local-TZ shift.

  it('returns the UTC date for a UTC-midnight ISO string', () => {
    expect(toDateOnlyInputValue('2026-05-11T00:00:00.000Z')).toBe('2026-05-11');
  });

  it('returns the UTC date for a Date object (no local-TZ shift)', () => {
    const d = new Date('2026-05-11T00:00:00.000Z');
    expect(toDateOnlyInputValue(d)).toBe('2026-05-11');
  });

  it('passes through a bare YYYY-MM-DD string unchanged', () => {
    expect(toDateOnlyInputValue('2026-05-11')).toBe('2026-05-11');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(toDateOnlyInputValue(null)).toBe('');
    expect(toDateOnlyInputValue(undefined)).toBe('');
    expect(toDateOnlyInputValue('')).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(toDateOnlyInputValue('not-a-date')).toBe('');
  });
});
