/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- module mocks ---------------------------------------------------------
// calendar.ts -> getCalendarClient touches prisma + crypto + googleapis.
// We stub those so importing the module does not hit a real DB or network,
// and so we can drive events.insert / events.list / events.delete in tests.

const eventsInsertMock = vi.fn();
const eventsListMock = vi.fn();
const eventsDeleteMock = vi.fn();
const eventsPatchMock = vi.fn();
const calendarListGetMock = vi.fn();
const calendarListListMock = vi.fn();

const fakeCalendarClient = {
  events: {
    insert: eventsInsertMock,
    list: eventsListMock,
    delete: eventsDeleteMock,
    patch: eventsPatchMock,
  },
  calendarList: { get: calendarListGetMock, list: calendarListListMock },
};

vi.mock('googleapis', () => {
  // Real class so `new google.auth.OAuth2(...)` constructs correctly inside
  // getCalendarClient. Arrow-function vi.fn() cannot be used with `new`.
  class FakeOAuth2 {
    setCredentials() {}
    on() {}
  }
  return {
    google: {
      auth: { OAuth2: FakeOAuth2 },
      calendar: () => fakeCalendarClient,
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        googleRefreshToken: 'rt',
        googleTokenExpiresAt: null,
        syncTargetCalendarId: 'primary',
        timezone: 'UTC',
      }),
      update: vi.fn(),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'acc1',
        access_token: 'at',
        expires_at: null,
      }),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn((t: string) => t) }));
vi.mock('@/lib/completion-token', () => ({
  getCompletionUrl: vi.fn(() => 'http://example.test/c/tok'),
  getAimCompletionUrl: vi.fn(() => 'http://example.test/c/atok'),
  getBaseUrl: vi.fn(() => 'http://example.test'),
}));

beforeEach(() => {
  eventsInsertMock.mockReset();
  eventsListMock.mockReset();
  eventsDeleteMock.mockReset();
  eventsPatchMock.mockReset();
  calendarListGetMock.mockReset();
  calendarListGetMock.mockResolvedValue({ data: { id: 'primary' } });
  calendarListListMock.mockReset();
});

// Import AFTER mocks so the module under test sees the stubbed deps.
import {
  createGoogleEvent,
  safeDeleteGoogleEvent,
  listTaggedPrismEvents,
  listAllTaggedPrismMasters,
  listWritableCalendarIds,
  listUntaggedPrismLookalikes,
  findExistingPrismEvent,
  syncTaskCalendarEvent,
  PRISM_MANAGED_EXT_KEY,
  prismRecordExtKey,
} from '@/lib/calendar';

describe('createGoogleEvent — extendedProperties tagging', () => {
  it('tags created events with prismManaged=1 and the supplied prismType', async () => {
    eventsInsertMock.mockResolvedValueOnce({ data: { id: 'evt1' } });

    await createGoogleEvent(
      'user1',
      {
        summary: 'Weekly Review',
        start: '2026-04-26T10:00:00Z',
        end: '2026-04-26T11:00:00Z',
        prismType: 'review',
      },
      'primary',
    );

    expect(eventsInsertMock).toHaveBeenCalledTimes(1);
    const args = eventsInsertMock.mock.calls[0][0];
    expect(args.requestBody.extendedProperties).toEqual({
      private: { prismManaged: '1', prismType: 'review' },
    });
  });

  it('omits the tag when prismType is not provided (ad-hoc UI events stay untagged)', async () => {
    eventsInsertMock.mockResolvedValueOnce({ data: { id: 'evt2' } });

    await createGoogleEvent(
      'user1',
      {
        summary: 'Ad-hoc UI event',
        start: '2026-04-26T10:00:00Z',
        end: '2026-04-26T11:00:00Z',
      },
      'primary',
    );

    const args = eventsInsertMock.mock.calls[0][0];
    expect(args.requestBody.extendedProperties).toBeUndefined();
  });

  it('exports a stable PRISM_MANAGED_EXT_KEY for use in events.list filters', () => {
    expect(PRISM_MANAGED_EXT_KEY).toBe('prismManaged=1');
  });

  it('writes prismRecordId into extendedProperties when supplied so dedup lookups can find the event', async () => {
    eventsInsertMock.mockResolvedValueOnce({ data: { id: 'evtR' } });

    await createGoogleEvent(
      'user1',
      {
        summary: 'Project planning',
        start: '2026-04-26T10:00:00Z',
        end: '2026-04-26T11:00:00Z',
        prismType: 'meeting',
        prismRecordId: 'meeting-abc',
      },
      'primary',
    );

    const args = eventsInsertMock.mock.calls[0][0];
    expect(args.requestBody.extendedProperties).toEqual({
      private: {
        prismManaged: '1',
        prismType: 'meeting',
        prismRecordId: 'meeting-abc',
      },
    });
  });
});

describe('findExistingPrismEvent', () => {
  it('queries events.list with privateExtendedProperty=prismRecordId=<id> and returns the first non-cancelled id', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: { items: [{ id: 'evt-existing', status: 'confirmed' }] },
    });

    const result = await findExistingPrismEvent('user1', 'primary', 'task-xyz');

    expect(result).toBe('evt-existing');
    expect(eventsListMock).toHaveBeenCalledTimes(1);
    expect(eventsListMock.mock.calls[0][0].privateExtendedProperty).toEqual([
      'prismRecordId=task-xyz',
    ]);
  });

  it('appends prismType filter when supplied to defend against record-id collisions across types', async () => {
    eventsListMock.mockResolvedValueOnce({ data: { items: [] } });
    await findExistingPrismEvent('user1', 'primary', 'rec-1', 'meeting');
    expect(eventsListMock.mock.calls[0][0].privateExtendedProperty).toEqual([
      'prismRecordId=rec-1',
      'prismType=meeting',
    ]);
  });

  it('throws on API errors so callers do not silently fall through to a duplicate insert', async () => {
    const authErr = Object.assign(new Error('unauthorized'), { code: 401 });
    eventsListMock.mockRejectedValueOnce(authErr);
    await expect(findExistingPrismEvent('user1', 'primary', 'task-flaky')).rejects.toThrow();
  });

  it('returns null when no events match', async () => {
    eventsListMock.mockResolvedValueOnce({ data: { items: [] } });
    const result = await findExistingPrismEvent('user1', 'primary', 'task-missing');
    expect(result).toBeNull();
  });

  it('skips cancelled events (Google still returns them with showDeleted=false in some cases)', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'evt-cancelled', status: 'cancelled' },
          { id: 'evt-live', status: 'confirmed' },
        ],
      },
    });

    const result = await findExistingPrismEvent('user1', 'primary', 'task-zzz');
    expect(result).toBe('evt-live');
  });

  it('exports the prismRecordExtKey helper for use in events.list filters', () => {
    expect(prismRecordExtKey('abc')).toBe('prismRecordId=abc');
  });
});

describe('syncTaskCalendarEvent dedup contract', () => {
  it('on create with no local calendarEventId, looks up Google by prismRecordId and updates the existing event instead of inserting a duplicate', async () => {
    // First call: findExistingPrismEvent → returns an existing event id
    eventsListMock.mockResolvedValueOnce({
      data: { items: [{ id: 'evt-orphan', status: 'confirmed' }] },
    });
    // Second call: updateGoogleEvent → patch returns the same id
    eventsPatchMock.mockResolvedValueOnce({ data: { id: 'evt-orphan' } });

    const eventId = await syncTaskCalendarEvent(
      'user1',
      {
        id: 'task-1',
        calendarEventId: null,
        title: 'Reattached task',
        timeBlockStart: new Date('2026-04-26T10:00:00Z'),
        timeBlockEnd: new Date('2026-04-26T11:00:00Z'),
      },
      'create',
    );

    expect(eventId).toBe('evt-orphan');
    // The contract: NO insert was issued, only a patch — this is what
    // prevents duplicates when the local DB lost track of the event id.
    expect(eventsInsertMock).not.toHaveBeenCalled();
    expect(eventsPatchMock).toHaveBeenCalledTimes(1);
  });

  it('on create when Google has no matching event, inserts a fresh event with prismRecordId tag', async () => {
    eventsListMock.mockResolvedValueOnce({ data: { items: [] } });
    eventsInsertMock.mockResolvedValueOnce({ data: { id: 'evt-new' } });

    const eventId = await syncTaskCalendarEvent(
      'user1',
      {
        id: 'task-2',
        calendarEventId: null,
        title: 'Fresh task',
        timeBlockStart: new Date('2026-04-26T10:00:00Z'),
        timeBlockEnd: new Date('2026-04-26T11:00:00Z'),
      },
      'create',
    );

    expect(eventId).toBe('evt-new');
    expect(eventsInsertMock).toHaveBeenCalledTimes(1);
    expect(eventsInsertMock.mock.calls[0][0].requestBody.extendedProperties.private).toEqual({
      prismManaged: '1',
      prismType: 'task',
      prismRecordId: 'task-2',
    });
  });
});

describe('safeDeleteGoogleEvent', () => {
  it('returns ok=true when delete succeeds on the first try', async () => {
    eventsDeleteMock.mockResolvedValueOnce({});
    const result = await safeDeleteGoogleEvent('user1', 'evt1', 'primary');
    expect(result).toEqual({ ok: true });
    expect(eventsDeleteMock).toHaveBeenCalledTimes(1);
  });

  it('treats 404 (already gone) as ok=true (idempotent)', async () => {
    const err = Object.assign(new Error('gone'), { code: 404 });
    eventsDeleteMock.mockRejectedValueOnce(err);
    const result = await safeDeleteGoogleEvent('user1', 'evt-gone', 'primary');
    expect(result).toEqual({ ok: true });
  });

  it('retries once on transient failure then returns ok=true', async () => {
    const transient = Object.assign(new Error('boom'), { code: 503 });
    eventsDeleteMock
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({});
    const result = await safeDeleteGoogleEvent('user1', 'evt2', 'primary');
    expect(result).toEqual({ ok: true });
    expect(eventsDeleteMock).toHaveBeenCalledTimes(2);
  });

  it('returns ok=false with reason after both attempts fail', async () => {
    const transient = Object.assign(new Error('still broken'), { code: 503 });
    eventsDeleteMock.mockRejectedValue(transient);
    const result = await safeDeleteGoogleEvent('user1', 'evt3', 'primary');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.eventId).toBe('evt3');
      expect(result.reason).toContain('still broken');
    }
    expect(eventsDeleteMock).toHaveBeenCalledTimes(2);
  });
});

describe('listTaggedPrismEvents', () => {
  it('queries each calendar with privateExtendedProperty=prismManaged=1 and merges results', async () => {
    eventsListMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'a1', summary: 'A' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'b1', summary: 'B' }] } });

    const result = await listTaggedPrismEvents(
      'user1',
      '2026-04-01T00:00:00Z',
      '2026-04-30T00:00:00Z',
      ['cal-A', 'cal-B'],
    );

    expect(eventsListMock).toHaveBeenCalledTimes(2);
    for (const call of eventsListMock.mock.calls) {
      expect(call[0].privateExtendedProperty).toEqual(['prismManaged=1']);
      expect(call[0].singleEvents).toBe(true);
    }

    const ids = result.map((e) => (e as any).id).sort();
    expect(ids).toEqual(['a1', 'b1']);
    // Each result is tagged with the calendar it came from
    for (const ev of result) {
      expect((ev as any)._sourceCalendarId).toMatch(/^cal-[AB]$/);
    }
  });

  it('follows nextPageToken pagination', async () => {
    eventsListMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'p1' }], nextPageToken: 'tok' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'p2' }] } });

    const result = await listTaggedPrismEvents(
      'user1',
      '2026-04-01T00:00:00Z',
      '2026-04-30T00:00:00Z',
      ['cal-A'],
    );

    expect(eventsListMock).toHaveBeenCalledTimes(2);
    expect(eventsListMock.mock.calls[1][0].pageToken).toBe('tok');
    expect(result.map((e) => (e as any).id)).toEqual(['p1', 'p2']);
  });
});

describe('listAllTaggedPrismMasters', () => {
  it('queries each calendar with singleEvents=false + prismManaged tag and tags results with sourceCalendarId', async () => {
    eventsListMock
      .mockResolvedValueOnce({ data: { items: [{ id: 'master-A', summary: 'Weekly Review' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'master-B', summary: 'Power Down Ritual' }] } });

    const result = await listAllTaggedPrismMasters('user1', ['cal-target', 'cal-stale']);

    expect(eventsListMock).toHaveBeenCalledTimes(2);
    for (const call of eventsListMock.mock.calls) {
      expect(call[0].privateExtendedProperty).toEqual(['prismManaged=1']);
      expect(call[0].singleEvents).toBe(false);
      expect(call[0].showDeleted).toBe(false);
    }
    const byId = new Map(result.map((e) => [e.id, e]));
    expect(byId.get('master-A')?._sourceCalendarId).toBe('cal-target');
    expect(byId.get('master-B')?._sourceCalendarId).toBe('cal-stale');
  });

  it('skips modified-instance overrides (events with recurringEventId)', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'master-1', summary: 'Weekly Review' },
          { id: 'instance-1', summary: 'Weekly Review', recurringEventId: 'master-1' },
        ],
      },
    });

    const result = await listAllTaggedPrismMasters('user1', ['cal-target']);

    const ids = result.map((e) => e.id);
    expect(ids).toEqual(['master-1']);
  });

  it('isolates per-calendar failures so one failed calendar does not poison others', async () => {
    eventsListMock
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 403 }))
      .mockResolvedValueOnce({ data: { items: [{ id: 'master-B' }] } });

    const result = await listAllTaggedPrismMasters('user1', ['cal-broken', 'cal-ok']);

    // First calendar errored — its results are dropped. Second calendar succeeds.
    const ids = result.map((e) => e.id);
    expect(ids).toEqual(['master-B']);
    expect(result[0]?._sourceCalendarId).toBe('cal-ok');
  });

  it('returns empty array when calendarIds is empty (no API calls)', async () => {
    const result = await listAllTaggedPrismMasters('user1', []);
    expect(result).toEqual([]);
    expect(eventsListMock).not.toHaveBeenCalled();
  });
});

describe('listWritableCalendarIds', () => {
  it('asks Google for writer-or-above calendars and returns just their ids', async () => {
    calendarListListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'primary', accessRole: 'owner' },
          { id: 'cal-team', accessRole: 'writer' },
        ],
      },
    });

    const result = await listWritableCalendarIds('user1');

    expect(calendarListListMock).toHaveBeenCalledTimes(1);
    expect(calendarListListMock.mock.calls[0][0]).toEqual({ minAccessRole: 'writer' });
    expect(result).toEqual(['primary', 'cal-team']);
  });

  it('returns [] on API failure (non-fatal — sweep falls back to caller calendar set)', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    calendarListListMock.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { code: 429 }));

    const result = await listWritableCalendarIds('user1');

    expect(result).toEqual([]);
    consoleWarn.mockRestore();
  });

  it('drops items without an id (Google sometimes returns synthetic entries)', async () => {
    calendarListListMock.mockResolvedValueOnce({
      data: { items: [{ id: 'real-cal' }, { id: null }, {}] },
    });

    const result = await listWritableCalendarIds('user1');

    expect(result).toEqual(['real-cal']);
  });
});

describe('listUntaggedPrismLookalikes', () => {
  const PRISM_PD_DESC = 'Start your Power Down Ritual in Prism: https://prism.example/powerdown';

  it('returns masters that match Prism title + description but lack the prismManaged tag', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'untagged-1', summary: 'Power Down Ritual', description: PRISM_PD_DESC },
          { id: 'tagged-1', summary: 'Power Down Ritual', description: PRISM_PD_DESC, extendedProperties: { private: { prismManaged: '1' } } },
          { id: 'user-event', summary: 'Power Down Ritual', description: 'my own note' },
        ],
      },
    });

    const result = await listUntaggedPrismLookalikes('user1', ['cal-target'], ['Power Down Ritual']);

    expect(result.map((e) => e.id)).toEqual(['untagged-1']);
    expect(result[0]._sourceCalendarId).toBe('cal-target');
    expect(eventsListMock.mock.calls[0][0]).toMatchObject({
      calendarId: 'cal-target',
      q: 'Power Down Ritual',
      singleEvents: false,
      showDeleted: false,
    });
  });

  it('skips modified-instance overrides (events with recurringEventId)', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'master', summary: 'Power Down Ritual', description: PRISM_PD_DESC },
          { id: 'instance', summary: 'Power Down Ritual', description: PRISM_PD_DESC, recurringEventId: 'master' },
        ],
      },
    });

    const result = await listUntaggedPrismLookalikes('user1', ['cal-target'], ['Power Down Ritual']);

    expect(result.map((e) => e.id)).toEqual(['master']);
  });

  it("rejects events whose summary doesn't exactly match (q is fuzzy)", async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'fuzzy', summary: 'Power Down Ritual extra', description: PRISM_PD_DESC },
        ],
      },
    });

    const result = await listUntaggedPrismLookalikes('user1', ['cal-target'], ['Power Down Ritual']);

    expect(result).toEqual([]);
  });

  it('rejects events without the Prism description prefix (would delete user-authored events otherwise)', async () => {
    eventsListMock.mockResolvedValueOnce({
      data: {
        items: [
          { id: 'no-desc', summary: 'Power Down Ritual' },
          { id: 'wrong-desc', summary: 'Power Down Ritual', description: 'unrelated text' },
        ],
      },
    });

    const result = await listUntaggedPrismLookalikes('user1', ['cal-target'], ['Power Down Ritual']);

    expect(result).toEqual([]);
  });

  it('isolates per-(calendar,title) failures so one bad pair does not poison others', async () => {
    eventsListMock
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 403 }))
      .mockResolvedValueOnce({
        data: { items: [{ id: 'ok-1', summary: 'Power Down Ritual', description: PRISM_PD_DESC }] },
      });

    const result = await listUntaggedPrismLookalikes(
      'user1',
      ['cal-broken', 'cal-ok'],
      ['Power Down Ritual'],
    );

    expect(result.map((e) => e.id)).toEqual(['ok-1']);
    expect(result[0]._sourceCalendarId).toBe('cal-ok');
  });

  it('returns [] for empty calendar list or empty title list (no API calls)', async () => {
    expect(await listUntaggedPrismLookalikes('user1', [], ['Power Down Ritual'])).toEqual([]);
    expect(await listUntaggedPrismLookalikes('user1', ['cal-target'], [])).toEqual([]);
    expect(eventsListMock).not.toHaveBeenCalled();
  });
});
