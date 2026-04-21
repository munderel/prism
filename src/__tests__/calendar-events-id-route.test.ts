/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/schemas', () => ({
  parseBody: vi.fn(),
  updateCalendarEventSchema: {},
}));

vi.mock('@/lib/calendar', () => ({
  deleteGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findFirst: vi.fn() },
    review: { findFirst: vi.fn() },
    powerdownSession: { findFirst: vi.fn() },
    meeting: { findFirst: vi.fn() },
    aimInstance: { findFirst: vi.fn() },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { parseBody } from '@/lib/schemas';
import { deleteGoogleEvent, updateGoogleEvent } from '@/lib/calendar';
import { prisma } from '@/lib/prisma';
import { DELETE, PATCH } from '@/app/api/calendar/events/[id]/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockParseBody = vi.mocked(parseBody);
const mockDelete = vi.mocked(deleteGoogleEvent);
const mockUpdate = vi.mocked(updateGoogleEvent);
const mockTask = vi.mocked(prisma.task.findFirst);
const mockReview = vi.mocked(prisma.review.findFirst);
const mockPowerdown = vi.mocked(prisma.powerdownSession.findFirst);
const mockMeeting = vi.mocked(prisma.meeting.findFirst);
const mockAimInstance = vi.mocked(prisma.aimInstance.findFirst);

function allNull() {
  mockTask.mockResolvedValue(null);
  mockReview.mockResolvedValue(null);
  mockPowerdown.mockResolvedValue(null);
  mockMeeting.mockResolvedValue(null);
  mockAimInstance.mockResolvedValue(null);
}

function authAs(userId: string, isAdmin: boolean) {
  return { session: { user: { id: userId, isAdmin } }, userId } as any;
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) } as any;
}

describe('DELETE /api/calendar/events/[id] — Prism ownership gate (Critical #7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseBody.mockResolvedValue({ data: {} } as any);
  });

  it('returns 401 when unauth', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 } as any);
    allNull();
    const req = new Request('http://x/api/calendar/events/evt-1', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('evt-1'));
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when no Prism row references the event', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    const req = new Request('http://x/api/calendar/events/evt-ghost', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('evt-ghost'));
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('returns 403 when caller does not own the referencing row', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-bob', assigneeId: null } as any);
    const req = new Request('http://x/api/calendar/events/evt-bob', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('evt-bob'));
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('allows owner to delete (Task.ownerId path)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-alice', assigneeId: null } as any);
    mockDelete.mockResolvedValue(true as any);
    const req = new Request('http://x/api/calendar/events/evt-alice?calendarId=cal-a', { method: 'DELETE' });
    const res = await DELETE(req as any, paramsFor('evt-alice'));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('u-alice', 'evt-alice', 'cal-a');
  });

  it('allows assignee to delete via Task.assigneeId', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-bob', assigneeId: 'u-alice' } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-1', { method: 'DELETE' }) as any,
      paramsFor('evt-1'),
    );
    expect(res.status).toBe(200);
  });

  it('allows Review owner', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockReview.mockResolvedValue({ userId: 'u-alice' } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-review', { method: 'DELETE' }) as any,
      paramsFor('evt-review'),
    );
    expect(res.status).toBe(200);
  });

  it('allows PowerdownSession owner', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockPowerdown.mockResolvedValue({ userId: 'u-alice' } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-pd', { method: 'DELETE' }) as any,
      paramsFor('evt-pd'),
    );
    expect(res.status).toBe(200);
  });

  it('allows Meeting creator (createdById)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockMeeting.mockResolvedValue({ createdById: 'u-alice' } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-mtg', { method: 'DELETE' }) as any,
      paramsFor('evt-mtg'),
    );
    expect(res.status).toBe(200);
  });

  it('allows AimInstance owner', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockAimInstance.mockResolvedValue({ userId: 'u-alice' } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-aim', { method: 'DELETE' }) as any,
      paramsFor('evt-aim'),
    );
    expect(res.status).toBe(200);
  });

  it('admin can delete even when not the owner (but row must exist)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('admin1', true));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-bob', assigneeId: null } as any);
    mockDelete.mockResolvedValue(true as any);
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-any', { method: 'DELETE' }) as any,
      paramsFor('evt-any'),
    );
    expect(res.status).toBe(200);
  });

  it('admin still blocked when no Prism row references the event (prevents blind passthrough)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('admin1', true));
    allNull();
    const res = await DELETE(
      new Request('http://x/api/calendar/events/evt-untracked', { method: 'DELETE' }) as any,
      paramsFor('evt-untracked'),
    );
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/calendar/events/[id] — Prism ownership gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseBody.mockResolvedValue({
      data: { start: '2026-05-01T10:00:00Z', end: '2026-05-01T11:00:00Z', calendarId: 'primary' },
    } as any);
  });

  it('returns 403 when caller does not own the referencing row', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-bob', assigneeId: null } as any);
    const res = await PATCH(
      new Request('http://x/api/calendar/events/evt-bob', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }) as any,
      paramsFor('evt-bob'),
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('allows owner to update', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    mockTask.mockResolvedValue({ ownerId: 'u-alice', assigneeId: null } as any);
    mockUpdate.mockResolvedValue(true as any);
    const res = await PATCH(
      new Request('http://x/api/calendar/events/evt-alice', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }) as any,
      paramsFor('evt-alice'),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does not call parseBody before ownership fails (fail-closed ordering)', async () => {
    mockRequireAuth.mockResolvedValue(authAs('u-alice', false));
    allNull();
    const res = await PATCH(
      new Request('http://x/api/calendar/events/evt-ghost', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }) as any,
      paramsFor('evt-ghost'),
    );
    expect(res.status).toBe(404);
    expect(mockParseBody).not.toHaveBeenCalled();
  });
});
