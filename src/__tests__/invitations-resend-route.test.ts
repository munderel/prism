/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  notFoundResponse: vi.fn((e: string) => Response.json({ error: `${e} not found` }, { status: 404 })),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/notifications', () => ({
  isEmailTransportConfigured: vi.fn(() => true),
  sendInviteEmail: vi.fn(),
}));

vi.mock('@/lib/origin-check', () => ({
  verifyRequestOrigin: vi.fn(() => true),
}));

import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { isEmailTransportConfigured, sendInviteEmail } from '@/lib/notifications';
import { verifyRequestOrigin } from '@/lib/origin-check';
import { POST } from '@/app/api/invitations/[id]/resend/route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockFindUnique = vi.mocked(prisma.invitation.findUnique);
const mockUpdate = vi.mocked(prisma.invitation.update);
const mockCount = vi.mocked(prisma.invitation.count);
const mockEmailConfigured = vi.mocked(isEmailTransportConfigured);
const mockSendInviteEmail = vi.mocked(sendInviteEmail);
const mockVerifyOrigin = vi.mocked(verifyRequestOrigin);

const adminResult = { session: { user: { id: 'admin1', isAdmin: true } }, userId: 'admin1' } as any;

function req() {
  return new Request('http://localhost/api/invitations/inv-1/resend', {
    method: 'POST',
    headers: { origin: 'http://localhost', host: 'localhost' },
  }) as any;
}

const ctx = { params: Promise.resolve({ id: 'inv-1' }) };

const pendingInvite = {
  id: 'inv-1',
  email: 'invitee@example.com',
  role: 'user',
  status: 'PENDING',
  invitedById: 'admin1',
  createdAt: new Date('2020-01-01T00:00:00Z'),
  invitedBy: { name: 'Admin', email: 'admin@example.com' },
};

describe('POST /api/invitations/[id]/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(adminResult);
    mockVerifyOrigin.mockReturnValue(true);
    mockEmailConfigured.mockReturnValue(true);
    mockCount.mockResolvedValue(0 as any);
    mockSendInviteEmail.mockResolvedValue({ configured: true, sent: true } as any);
  });

  it('returns 403 for a cross-origin request', async () => {
    mockVerifyOrigin.mockReturnValue(false);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: 'Forbidden', status: 401 } as any);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the invitation does not exist', async () => {
    mockFindUnique.mockResolvedValue(null as any);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 409 for a non-PENDING (accepted) invitation', async () => {
    mockFindUnique.mockResolvedValue({ ...pendingInvite, status: 'ACCEPTED' } as any);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 429 when the admin is over the hourly budget', async () => {
    mockFindUnique.mockResolvedValue(pendingInvite as any);
    mockCount.mockResolvedValue(10 as any);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(429);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('regenerates the token, resets createdAt, and re-sends the email for an expired PENDING invite', async () => {
    mockFindUnique.mockResolvedValue(pendingInvite as any);
    mockUpdate.mockImplementation(async (args: any) => ({
      ...pendingInvite,
      token: args.data.token,
      createdAt: args.data.createdAt,
    })) as any;

    const before = Date.now();
    const res = await POST(req(), ctx);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdate.mock.calls[0][0] as any;
    // Fresh 64-hex token (crypto.randomBytes(32).toString('hex')).
    expect(updateArgs.data.token).toMatch(/^[0-9a-f]{64}$/);
    // createdAt reset to ~now (restarting the 7-day window).
    expect(new Date(updateArgs.data.createdAt).getTime()).toBeGreaterThanOrEqual(before);

    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    const [to, , url] = mockSendInviteEmail.mock.calls[0];
    expect(to).toBe('invitee@example.com');
    expect(url).toContain(`/accept-invite/inv-1?token=${updateArgs.data.token}`);

    const body = await res.json();
    expect(body.inviteUrl).toContain(`?token=${updateArgs.data.token}`);
    expect(body.emailSent).toBe(true);
  });
});
