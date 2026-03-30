import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';
import { getNextReviewDate } from '@/lib/review-dates';
import { nextDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const reviewType = searchParams.get('reviewType');
  const scope = searchParams.get('scope'); // 'team' | 'individual' | null (both)
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const conditions: any[] = [];

  // Team reviews are visible to everyone
  if (scope !== 'individual') {
    const teamWhere: any = { isTeamReview: true };
    if (reviewType) teamWhere.reviewType = reviewType;
    conditions.push(teamWhere);
  }

  // Individual reviews: owner sees their own, admin sees all
  if (scope !== 'team') {
    const individualWhere: any = { isTeamReview: false };
    if (auth.session.user.isAdmin) {
      // Admin can see all individual reviews
    } else {
      individualWhere.userId = auth.userId;
    }
    if (reviewType) individualWhere.reviewType = reviewType;
    conditions.push(individualWhere);
  }

  // Date range filter
  const dateFilter: any = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    dateFilter.lt = toDate;
  }

  const baseWhere: any = conditions.length === 1 ? conditions[0] : { OR: conditions };
  if (from || to) baseWhere.scheduledDate = dateFilter;

  const reviews = await prisma.review.findMany({
    where: baseWhere,
    orderBy: { scheduledDate: 'desc' },
    take: 100,
    include: { answers: true },
  });

  return Response.json(reviews);
}

/**
 * Compute the next scheduled date from a monthly recurrence rule.
 * Rules: 'last-friday', 'last-monday', '1st-monday', '1st-friday', '15th'
 */
function computeMonthlyDate(rule: string, after: Date): Date {
  const year = after.getFullYear();
  const month = after.getMonth();

  const tryMonth = (m: number, y: number): Date | null => {
    if (rule === '15th') {
      const d = new Date(y, m, 15);
      return d > after ? d : null;
    }
    const dayMap: Record<string, number> = { monday: 1, friday: 5 };
    const parts = rule.split('-');
    if (parts[0] === 'last') {
      const targetDay = dayMap[parts[1]] ?? 5;
      // Last occurrence: start from last day of month and go backward
      const lastDay = new Date(y, m + 1, 0);
      const diff = (lastDay.getDay() - targetDay + 7) % 7;
      const d = new Date(y, m, lastDay.getDate() - diff);
      return d > after ? d : null;
    }
    if (parts[0] === '1st') {
      const targetDay = dayMap[parts[1]] ?? 1;
      const firstDay = new Date(y, m, 1);
      const diff = (targetDay - firstDay.getDay() + 7) % 7;
      const d = new Date(y, m, 1 + diff);
      return d > after ? d : null;
    }
    return null;
  };

  // Try current month, then next month, etc
  for (let i = 0; i < 13; i++) {
    const m = (month + i) % 12;
    const y = year + Math.floor((month + i) / 12);
    const result = tryMonth(m, y);
    if (result) return result;
  }

  // Fallback
  return new Date(year, month + 1, 1);
}

/**
 * Compute the next scheduled date from a yearly recurrence rule.
 * Rules: 'last-sat-dec', 'dec-30', 'dec-31', 'custom'
 */
function computeYearlyDate(rule: string, after: Date, customDate?: string): Date {
  const year = after.getFullYear();

  if (rule === 'dec-30') {
    const d = new Date(year, 11, 30);
    return d > after ? d : new Date(year + 1, 11, 30);
  }
  if (rule === 'dec-31') {
    const d = new Date(year, 11, 31);
    return d > after ? d : new Date(year + 1, 11, 31);
  }
  if (rule === 'last-sat-dec') {
    // Last Saturday of December
    const dec31 = new Date(year, 11, 31);
    const diff = (dec31.getDay() - 6 + 7) % 7;
    const d = new Date(year, 11, 31 - diff);
    return d > after ? d : (() => {
      const dec31Next = new Date(year + 1, 11, 31);
      const diff2 = (dec31Next.getDay() - 6 + 7) % 7;
      return new Date(year + 1, 11, 31 - diff2);
    })();
  }
  if (rule === 'custom' && customDate) {
    const d = new Date(customDate);
    return d > after ? d : new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  }

  return new Date(year + 1, 0, 1);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { reviewType, startDate, recurrenceDayOfWeek, isTeamReview, scheduleConfig } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  // Team reviews require admin role
  if (isTeamReview) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  }

  // Check for existing overdue/pending review of this type
  const existingWhere: any = { reviewType, completedAt: null };
  if (isTeamReview) {
    existingWhere.isTeamReview = true;
  } else {
    existingWhere.userId = auth.userId;
    existingWhere.isTeamReview = false;
  }

  const existing = await prisma.review.findFirst({ where: existingWhere });

  if (existing) {
    return Response.json({ error: 'An incomplete review of this type already exists' }, { status: 409 });
  }

  const now = new Date();

  // Calculate scheduled date, using scheduleConfig recurrence rules when provided
  let scheduledDate: Date;
  if (scheduleConfig) {
    const configType = scheduleConfig.type as string;
    if (configType === 'weekly' && scheduleConfig.dayOfWeek !== null && scheduleConfig.dayOfWeek !== undefined) {
      const dayOfWeek = scheduleConfig.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      if (now.getDay() === dayOfWeek) {
        // If today is the target day, schedule for next week
        scheduledDate = nextDay(now, dayOfWeek);
      } else {
        scheduledDate = nextDay(now, dayOfWeek);
      }
    } else if (configType === 'monthly' && scheduleConfig.recurrenceRule) {
      scheduledDate = computeMonthlyDate(scheduleConfig.recurrenceRule, now);
    } else if (configType === 'yearly' && scheduleConfig.recurrenceRule) {
      scheduledDate = computeYearlyDate(scheduleConfig.recurrenceRule, now, scheduleConfig.customDate);
    } else {
      scheduledDate = getNextReviewDate(reviewType);
    }
  } else if (startDate && recurrenceDayOfWeek !== undefined && recurrenceDayOfWeek !== null) {
    // Find the next occurrence of the specified day of week on or after startDate
    const base = new Date(startDate);
    const dayOfWeek = recurrenceDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    if (base.getDay() === dayOfWeek) {
      scheduledDate = base;
    } else {
      scheduledDate = nextDay(base, dayOfWeek);
    }
  } else if (startDate) {
    scheduledDate = new Date(startDate);
  } else {
    scheduledDate = getNextReviewDate(reviewType);
  }

  // If scheduleConfig provides time + duration, compute time blocks
  let timeBlockStart: Date | undefined;
  let timeBlockEnd: Date | undefined;
  if (scheduleConfig?.time && scheduleConfig?.duration) {
    const [h, m] = (scheduleConfig.time as string).split(':').map(Number);
    const durationMin = scheduleConfig.duration as number;
    const blockStart = new Date(scheduledDate);
    blockStart.setHours(h, m, 0, 0);
    const blockEnd = new Date(blockStart.getTime() + durationMin * 60 * 1000);
    timeBlockStart = blockStart;
    timeBlockEnd = blockEnd;
  }

  const review = await prisma.review.create({
    data: {
      userId: auth.userId,
      reviewType,
      scheduledDate,
      startDate: startDate ? new Date(startDate) : undefined,
      recurrenceDayOfWeek: recurrenceDayOfWeek ?? (scheduleConfig?.dayOfWeek !== null && scheduleConfig?.dayOfWeek !== undefined ? scheduleConfig.dayOfWeek : undefined),
      isTeamReview: isTeamReview ?? false,
      ...(timeBlockStart ? { timeBlockStart } : {}),
      ...(timeBlockEnd ? { timeBlockEnd } : {}),
    },
  });

  return Response.json(review, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { reviewType } = body;

  if (!reviewType) {
    return Response.json({ error: 'reviewType is required' }, { status: 400 });
  }

  const result = await prisma.review.deleteMany({
    where: {
      userId: auth.userId,
      reviewType,
      completedAt: null,
    },
  });

  return Response.json({ ok: true, deleted: result.count }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

