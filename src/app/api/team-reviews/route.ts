import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const reviews = await prisma.recurringTeamReview.findMany({
    where: { isActive: true },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(reviews);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data as any;
  const { reviewType, dayOfWeek, time, duration } = body;

  if (!reviewType || dayOfWeek == null || !time) {
    return Response.json(
      { error: 'reviewType, dayOfWeek, and time are required' },
      { status: 400 }
    );
  }

  if (!['WEEKLY', 'MONTHLY', 'YEARLY'].includes(reviewType)) {
    return Response.json({ error: 'Invalid reviewType' }, { status: 400 });
  }

  if (dayOfWeek < 0 || dayOfWeek > 6) {
    return Response.json({ error: 'dayOfWeek must be 0-6' }, { status: 400 });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: 'time must be HH:mm format' }, { status: 400 });
  }

  const record = await prisma.recurringTeamReview.create({
    data: {
      reviewType,
      dayOfWeek,
      time,
      duration: duration && duration > 0 ? duration : 60,
      createdById: auth.userId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return Response.json(record, { status: 201 });
}
