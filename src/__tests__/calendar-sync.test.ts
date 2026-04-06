/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';

import type { GoogleEventOverride, ManagedRecurringSeriesState } from '@/lib/google-sync-state';
import { parseGoogleSyncState, cloneGoogleSyncState, normalizeCancelledDates } from '@/lib/google-sync-state';

describe('parseGoogleSyncState', () => {
  it('returns empty object for null input', () => {
    expect(parseGoogleSyncState(null)).toEqual({});
  });

  it('returns empty object for non-object input', () => {
    expect(parseGoogleSyncState('string')).toEqual({});
    expect(parseGoogleSyncState(42)).toEqual({});
    expect(parseGoogleSyncState([])).toEqual({});
  });

  it('passes through valid state object', () => {
    const state = {
      recurringReviews: {
        WEEKLY: { eventId: 'abc123', lastSyncedAt: '2026-04-01T00:00:00Z' },
      },
      powerdown: { eventId: 'def456' },
    };
    expect(parseGoogleSyncState(state)).toBe(state);
  });
});

describe('cloneGoogleSyncState', () => {
  it('deep clones state so mutations do not affect original', () => {
    const original: any = {
      recurringReviews: {
        WEEKLY: {
          eventId: 'abc',
          overrides: { '2026-04-07': { start: '2026-04-07T10:00:00Z', end: '2026-04-07T11:00:00Z' } },
        },
      },
    };
    const clone = cloneGoogleSyncState(original);
    clone.recurringReviews!.WEEKLY!.eventId = 'changed';
    expect(original.recurringReviews.WEEKLY.eventId).toBe('abc');
  });
});

describe('normalizeCancelledDates', () => {
  it('returns sorted, deduplicated dates', () => {
    const series: ManagedRecurringSeriesState = {
      eventId: 'x',
      cancelledDates: ['2026-04-10', '2026-04-05', '2026-04-10', '2026-04-01'],
    };
    expect(normalizeCancelledDates(series)).toEqual(['2026-04-01', '2026-04-05', '2026-04-10']);
  });

  it('returns empty array for undefined series', () => {
    expect(normalizeCancelledDates(undefined)).toEqual([]);
  });
});

describe('GoogleEventOverride with updatedAt', () => {
  it('supports the updatedAt field', () => {
    const override: GoogleEventOverride = {
      googleEventId: 'inst_123',
      start: '2026-04-07T14:00:00Z',
      end: '2026-04-07T15:00:00Z',
      updatedAt: '2026-04-06T12:00:00Z',
    };
    expect(override.updatedAt).toBe('2026-04-06T12:00:00Z');
  });

  it('updatedAt is optional for backwards compatibility', () => {
    const override: GoogleEventOverride = {
      start: '2026-04-07T10:00:00Z',
      end: '2026-04-07T11:00:00Z',
    };
    expect(override.updatedAt).toBeUndefined();
  });
});
