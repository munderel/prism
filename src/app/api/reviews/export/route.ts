import { NextRequest } from 'next/server';
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

  const completedAt: any = { not: null };
  if (from) completedAt.gte = new Date(from);
  if (to) completedAt.lte = new Date(to);

  const where: any = { completedAt };
  if (type) where.reviewType = type;

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

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reviews-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
