import { describe, it, expect } from 'vitest';
import { eachLocalDateInRange, toLocalDateKey, toTaskDueDateKey } from '@/lib/date-utils';

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

describe('toTaskDueDateKey', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(toTaskDueDateKey(null)).toBe('');
    expect(toTaskDueDateKey(undefined)).toBe('');
    expect(toTaskDueDateKey('')).toBe('');
  });

  it('returns bare YYYY-MM-DD strings unchanged', () => {
    expect(toTaskDueDateKey('2026-05-20')).toBe('2026-05-20');
  });

  it('returns UTC date for a UTC-midnight ISO (legacy date-only convention)', () => {
    // parseDateOnly stores date-only tasks at UTC midnight. Their intended
    // calendar day is the UTC date — extracting via local time would shift
    // the day for non-UTC users.
    expect(toTaskDueDateKey('2026-05-20T00:00:00.000Z')).toBe('2026-05-20');
  });

  it('returns local date for a non-UTC-midnight ISO (timed convention)', () => {
    // A timed task stores a real wall-clock instant. The intended day is the
    // user's local calendar day. We construct a Date for 14:00 local on a
    // known date and verify the helper returns that date.
    const d = new Date(2026, 4, 20, 14, 0, 0, 0); // May 20, 14:00 local
    expect(toTaskDueDateKey(d)).toBe('2026-05-20');
  });

  it('returns empty string for invalid ISO input', () => {
    expect(toTaskDueDateKey('not-a-date')).toBe('');
  });

  it('accepts a Date object directly', () => {
    // UTC-midnight Date → returns UTC date
    const utcMidnight = new Date('2026-05-20T00:00:00.000Z');
    expect(toTaskDueDateKey(utcMidnight)).toBe('2026-05-20');
  });
});
