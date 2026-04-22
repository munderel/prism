import { NextRequest } from 'next/server';
import { Prisma, ReviewType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

const CSV_HEADERS = ['id', 'reviewType', 'isTeamReview', 'scheduledDate', 'completedAt', 'userName', 'userEmail', 'notes', 'checklistState'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const format = searchParams.get('format') ?? 'json';
  const scope = searchParams.get('scope');

  if (format !== 'json' && format !== 'csv') {
    return Response.json({ error: 'format must be "json" or "csv"' }, { status: 400 });
  }

  const completedAt: Prisma.DateTimeNullableFilter = { not: null };
  if (from) completedAt.gte = new Date(from);
  if (to) completedAt.lte = new Date(to);

  const where: Prisma.ReviewWhereInput = { completedAt };
  if (type) where.reviewType = type as ReviewType;

  if (scope === 'individual') {
    where.isTeamReview = false;
    if (!auth.session.user.isAdmin) where.userId = auth.userId;
  } else if (scope === 'team') {
    where.isTeamReview = true;
  } else if (!auth.session.user.isAdmin) {
    where.OR = [
      { isTeamReview: true },
      { isTeamReview: false, userId: auth.userId },
    ];
  }

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { completedAt: 'desc' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (format === 'json') {
    return Response.json(reviews);
  }

  const csvRows = [CSV_HEADERS.map(escapeCSV).join(',')];
  for (const r of reviews) {
    csvRows.push(
      [
        r.id,
        r.reviewType,
        String(r.isTeamReview),
        r.scheduledDate.toISOString(),
        r.completedAt?.toISOString() ?? '',
        r.user?.name ?? '',
        r.user?.email ?? '',
        r.notes ?? '',
        r.checklistState ? JSON.stringify(r.checklistState) : '',
      ]
        .map(escapeCSV)
        .join(',')
    );
  }

  // UTF-8 BOM so Excel recognizes the encoding; CRLF line endings to match
  // RFC 4180 and keep Excel / Numbers happy.
  const BOM = '\uFEFF';
  return new Response(BOM + csvRows.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reviews-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}

// Critical #11 — CSV formula-injection defense. A field starting with
// =, +, -, @, tab, or CR is interpreted as a formula by Excel / Google
// Sheets / LibreOffice; attacker-controlled cells (notes, user.name,
// user.email, checklistState JSON) could exfil data via WEBSERVICE() or
// hijack cells via DDE. Prefix any such field with a single quote which
// Excel treats as a literal-text sentinel, then apply the quote/comma
// /newline escaping required by RFC 4180.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
function escapeCSV(value: string): string {
  let v = value;
  if (FORMULA_TRIGGER.test(v)) v = `'${v}`;
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
