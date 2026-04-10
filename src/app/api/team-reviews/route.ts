import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, createTeamReviewSchema } from '@/lib/schemas';

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

  const parsed = await parseBody(request, createTeamReviewSchema);
  if ('error' in parsed) return parsed.error;
  const { reviewType, dayOfWeek, recurrenceRule, time, duration, memberIds } = parsed.data;

  if (reviewType === 'WEEKLY') {
    if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
      return Response.json({ error: 'dayOfWeek (0-6) is required for WEEKLY reviews' }, { status: 400 });
    }
  } else if (!recurrenceRule) {
    return Response.json({ error: 'recurrenceRule is required for MONTHLY/YEARLY reviews' }, { status: 400 });
  }

  const record = await prisma.recurringTeamReview.create({
    data: {
      reviewType,
      dayOfWeek: reviewType === 'WEEKLY' ? dayOfWeek : null,
      recurrenceRule: reviewType !== 'WEEKLY' ? recurrenceRule : null,
      time,
      duration: ((duration ?? 0) > 0 ? duration : 60)!,
      createdById: auth.userId,
      members: {
        create: memberIds.map((userId: string) => ({ userId })),
      },
    },
    include: TEAM_REVIEW_INCLUDE,
  });

  return Response.json(record, { status: 201 });
}
