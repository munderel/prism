/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/api-helpers', () => ({
  safeParseJson: vi.fn(),
  NO_STORE: { headers: { 'Cache-Control': 'no-store' } },
  notFoundResponse: vi.fn((entity: string) => Response.json({ error: `${entity} not found` }, { status: 404 })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('otplib', () => ({
  generateSecret: vi.fn(() => 'MOCK_SECRET_KEY'),
  generateURI: vi.fn(() => 'otpauth://totp/Prism:user@test.com?secret=MOCK_SECRET_KEY'),
  verifySync: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,MOCKQR')) },
}));

import { requireAuth } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { verifySync } from 'otplib';
import { GET, POST, DELETE } from '@/app/api/auth/setup-2fa/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSafeParseJson = vi.mocked(safeParseJson);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockVerifySync = vi.mocked(verifySync);

const authedResult = { session: { user: { id: 'user1', isAdmin: false } }, userId: 'user1' };

describe('GET /api/auth/setup-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 400 when 2FA already enabled', async () => {
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', is2FAEnabled: true } as any);
    const res = await GET();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already enabled');
  });

  it('returns secret, qrCode, and otpauthUrl on success', async () => {
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', is2FAEnabled: false } as any);
    mockUserUpdate.mockResolvedValue({} as any);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secret).toBe('MOCK_SECRET_KEY');
    expect(body.qrCode).toContain('data:image/png');
    expect(body.otpauthUrl).toContain('otpauth://');
  });

  it('stores secret on user record', async () => {
    mockUserFindUnique.mockResolvedValue({ email: 'user@test.com', is2FAEnabled: false } as any);
    mockUserUpdate.mockResolvedValue({} as any);
    await GET();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user1' },
        data: { totpSecret: 'MOCK_SECRET_KEY' },
      })
    );
  });
});

function createCodeRequest(code?: string) {
  return new Request('http://localhost/api/auth/setup-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(code !== undefined ? { code } : {}),
  });
}

describe('POST /api/auth/setup-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const res = await POST(createCodeRequest('123456'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when code is missing', async () => {
    mockSafeParseJson.mockResolvedValue({ data: {} } as any);
    const res = await POST(createCodeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 when no totpSecret on user', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '123456' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: null, is2FAEnabled: false } as any);
    const res = await POST(createCodeRequest('123456'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No 2FA secret');
  });

  it('returns 400 when 2FA already enabled', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '123456' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: 'SECRET', is2FAEnabled: true } as any);
    const res = await POST(createCodeRequest('123456'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already enabled');
  });

  it('returns 400 for invalid TOTP code', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '000000' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: 'SECRET', is2FAEnabled: false } as any);
    mockVerifySync.mockReturnValue(false);
    const res = await POST(createCodeRequest('000000'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid verification code');
  });

  it('enables 2FA on valid code', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '123456' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: 'SECRET', is2FAEnabled: false } as any);
    mockVerifySync.mockReturnValue(true);
    mockUserUpdate.mockResolvedValue({} as any);

    const res = await POST(createCodeRequest('123456'));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { is2FAEnabled: true },
      })
    );
  });
});

describe('DELETE /api/auth/setup-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(authedResult as any);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const req = createCodeRequest('123456');
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when 2FA not enabled', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '123456' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: null, is2FAEnabled: false } as any);
    const res = await DELETE(createCodeRequest('123456'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not enabled');
  });

  it('returns 400 for invalid code when disabling', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '000000' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: 'SECRET', is2FAEnabled: true } as any);
    mockVerifySync.mockReturnValue(false);
    const res = await DELETE(createCodeRequest('000000'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid verification code');
  });

  it('disables 2FA and wipes secret on valid code', async () => {
    mockSafeParseJson.mockResolvedValue({ data: { code: '123456' } } as any);
    mockUserFindUnique.mockResolvedValue({ totpSecret: 'SECRET', is2FAEnabled: true } as any);
    mockVerifySync.mockReturnValue(true);
    mockUserUpdate.mockResolvedValue({} as any);

    const res = await DELETE(createCodeRequest('123456'));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { is2FAEnabled: false, totpSecret: null },
      })
    );
  });
});
