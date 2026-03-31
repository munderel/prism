import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

const VALID_REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

const TEAM_REVIEW_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const reviews = await prisma.recurringTeamReview.findMany({
    where: { isActive: true },
    include: TEAM_REVIEW_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(reviews);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const { reviewType, dayOfWeek, recurrenceRule, time, duration, memberIds } = parsed.data;

  if (!reviewType || !time) {
    return Response.json({ error: 'reviewType and time are required' }, { status: 400 });
  }

  if (!VALID_REVIEW_TYPES.includes(reviewType)) {
    return Response.json({ error: 'Invalid reviewType' }, { status: 400 });
  }

  if (reviewType === 'WEEKLY') {
    if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
      return Response.json({ error: 'dayOfWeek (0-6) is required for WEEKLY reviews' }, { status: 400 });
    }
  } else if (!recurrenceRule) {
    return Response.json({ error: 'recurrenceRule is required for MONTHLY/YEARLY reviews' }, { status: 400 });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: 'time must be HH:mm format' }, { status: 400 });
  }

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return Response.json({ error: 'At least one member is required' }, { status: 400 });
  }

  const record = await prisma.recurringTeamReview.create({
    data: {
      reviewType,
      dayOfWeek: reviewType === 'WEEKLY' ? dayOfWeek : null,
      recurrenceRule: reviewType !== 'WEEKLY' ? recurrenceRule : null,
      time,
      duration: duration > 0 ? duration : 60,
      createdById: auth.userId,
      members: {
        create: memberIds.map((userId: string) => ({ userId })),
      },
    },
    include: TEAM_REVIEW_INCLUDE,
  });

  return Response.json(record, { status: 201 });
}
