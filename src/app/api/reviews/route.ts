import { NextRequest } from 'next/server';
import { Prisma, ReviewType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireAdmin, authError } from '@/lib/auth-guard';
import { NO_STORE } from '@/lib/api-helpers';
import { parseBody, createReviewSchema, deleteReviewSchema } from '@/lib/schemas';
import { getNextReviewDate } from '@/lib/review-dates';
import { nextDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const reviewType = searchParams.get('reviewType');
  const scope = searchParams.get('scope');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // Team review rows are per-user (each participant has their own Review
  // with isTeamReview=true and personal `notes` / `checklistState`). Before
  // this scoping, any authed user could read every teammate's free-text
  // "successes / difficulties" by listing team reviews. Now non-admins see
  // only their own rows; admins retain full visibility for rollups.
  const conditions: Prisma.ReviewWhereInput[] = [];
  const isAdmin = auth.session.user.isAdmin;

  if (scope !== 'individual') {
    const teamWhere: Prisma.ReviewWhereInput = { isTeamReview: true };
    if (!isAdmin) teamWhere.userId = auth.userId;
    if (reviewType) teamWhere.reviewType = reviewType as ReviewType;
    conditions.push(teamWhere);
  }

  if (scope !== 'team') {
    const individualWhere: Prisma.ReviewWhereInput = { isTeamReview: false };
    if (!isAdmin) individualWhere.userId = auth.userId;
    if (reviewType) individualWhere.reviewType = reviewType as ReviewType;
    conditions.push(individualWhere);
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    dateFilter.lt = toDate;
  }

  const baseWhere: Prisma.ReviewWhereInput = conditions.length === 1 ? conditions[0] : { OR: conditions };
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
    const d = lastSaturdayOfDec(year);
    return d > after ? d : lastSaturdayOfDec(year + 1);
  }
  if (rule === 'custom' && customDate) {
    const d = new Date(customDate);
    return d > after ? d : new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  }

  return new Date(year + 1, 0, 1);
}

function lastSaturdayOfDec(year: number): Date {
  const dec31 = new Date(year, 11, 31);
  const diff = (dec31.getDay() - 6 + 7) % 7;
  return new Date(year, 11, 31 - diff);
}

interface ScheduleConfig {
  type?: string;
  dayOfWeek?: number;
  recurrenceRule?: string;
  customDate?: string;
  time?: string;
  duration?: number;
}

function computeScheduledDate(config: ScheduleConfig, now: Date, reviewType: string): Date {
  const configType = config.type;
  if (configType === 'weekly' && config.dayOfWeek != null) {
    return nextDay(now, config.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  }
  if (configType === 'monthly' && config.recurrenceRule) {
    return computeMonthlyDate(config.recurrenceRule, now);
  }
  if (configType === 'yearly' && config.recurrenceRule) {
    return computeYearlyDate(config.recurrenceRule, now, config.customDate);
  }
  return getNextReviewDate(reviewType);
}

function computeTimeBlock(
  scheduledDate: Date,
  time?: string,
  duration?: number
): { timeBlockStart: Date; timeBlockEnd: Date } | Record<string, never> {
  if (!time || !duration) return {};
  const [h, m] = time.split(':').map(Number);
  const blockStart = new Date(scheduledDate);
  blockStart.setHours(h, m, 0, 0);
  const blockEnd = new Date(blockStart.getTime() + duration * 60_000);
  return { timeBlockStart: blockStart, timeBlockEnd: blockEnd };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createReviewSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { reviewType: reviewTypeStr, scheduledDate: scheduledDateStr, startDate, recurrenceDayOfWeek, isTeamReview, scheduleConfig } = body;
  const reviewType = reviewTypeStr as ReviewType;

  if (isTeamReview) {
    const adminAuth = await requireAdmin();
    if ('error' in adminAuth) return authError(adminAuth);
  }

  const now = new Date();

  let scheduledDate: Date;
  if (scheduledDateStr) {
    scheduledDate = new Date(scheduledDateStr);
  } else if (scheduleConfig) {
    scheduledDate = computeScheduledDate(scheduleConfig as ScheduleConfig, now, reviewType);
  } else if (startDate && recurrenceDayOfWeek != null) {
    const base = new Date(startDate);
    const dayOfWeek = recurrenceDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    scheduledDate = base.getDay() === dayOfWeek ? base : nextDay(base, dayOfWeek);
  } else if (startDate) {
    scheduledDate = new Date(startDate);
  } else {
    scheduledDate = getNextReviewDate(reviewType);
  }

  const scheduledDayStart = new Date(scheduledDate);
  scheduledDayStart.setHours(0, 0, 0, 0);
  const scheduledDayEnd = new Date(scheduledDayStart);
  scheduledDayEnd.setDate(scheduledDayEnd.getDate() + 1);

  const existingWhere: Prisma.ReviewWhereInput = {
    reviewType: reviewType as ReviewType,
    isTeamReview: !!isTeamReview,
    scheduledDate: {
      gte: scheduledDayStart,
      lt: scheduledDayEnd,
    },
    ...(!isTeamReview && { userId: auth.userId }),
  };

  const existing = await prisma.review.findFirst({
    where: existingWhere,
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return Response.json({ error: 'A review for this cadence already exists', existingId: existing.id }, { status: 409 });
  }

  const timeBlock = computeTimeBlock(scheduledDate, scheduleConfig?.time, scheduleConfig?.duration);

  const review = await prisma.review.create({
    data: {
      userId: auth.userId,
      reviewType: reviewType as ReviewType,
      scheduledDate,
      startDate: startDate ? new Date(startDate) : undefined,
      recurrenceDayOfWeek: recurrenceDayOfWeek ?? scheduleConfig?.dayOfWeek ?? undefined,
      isTeamReview: isTeamReview ?? false,
      ...timeBlock,
    },
  });

  return Response.json(review, { status: 201, ...NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, deleteReviewSchema);
  if ('error' in parsed) return parsed.error;
  const { reviewType: deleteReviewType } = parsed.data;

  const result = await prisma.review.deleteMany({
    where: {
      userId: auth.userId,
      reviewType: deleteReviewType as ReviewType,
      completedAt: null,
    },
  });

  return Response.json({ ok: true, deleted: result.count }, { status: 200, ...NO_STORE });
}

