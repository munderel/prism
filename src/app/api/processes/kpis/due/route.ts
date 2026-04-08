import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthFromRequest, authError } from '@/lib/auth-guard';
import { parseLocalDate, getLocalDateString, getWeekBoundaries, getMonthBoundaries, getYearBoundaries } from '@/lib/date-utils';
import type { ProcessCadence } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = await requireAuthFromRequest(request);
  if ('error' in auth) return authError(auth);

  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  const dateStr = searchParams.get('date');

  if (!period || !['daily', 'weekly', 'monthly', 'yearly'].includes(period)) {
    return Response.json({ error: 'period must be daily, weekly, monthly, or yearly' }, { status: 400 });
  }

  if (!dateStr) {
    return Response.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Parse the reference date
  const refDate = parseLocalDate(dateStr);
  if (isNaN(refDate.getTime())) {
    return Response.json({ error: 'Invalid date format' }, { status: 400 });
  }

  // Compute period window
  let windowStart: string;
  let windowEnd: string;

  switch (period) {
    case 'daily': {
      windowStart = dateStr;
      windowEnd = dateStr;
      break;
    }
    case 'weekly': {
      const bounds = getWeekBoundaries(refDate);
      windowStart = bounds.start;
      windowEnd = bounds.end;
      break;
    }
    case 'monthly': {
      const bounds = getMonthBoundaries(refDate);
      windowStart = bounds.start;
      windowEnd = bounds.end;
      break;
    }
    case 'yearly': {
      const bounds = getYearBoundaries(refDate);
      windowStart = bounds.start;
      windowEnd = bounds.end;
      break;
    }
    default:
      return Response.json({ error: 'Invalid period' }, { status: 400 });
  }

  // Map period to cadences
  const cadenceMap: Record<string, ProcessCadence[]> = {
    daily: ['DAILY'],
    weekly: ['WEEKLY', 'BIWEEKLY'],
    monthly: ['MONTHLY', 'QUARTERLY'],
    yearly: ['YEARLY'],
  };
  const cadences = cadenceMap[period];

  // Parse window dates for comparison
  const windowStartDate = parseLocalDate(windowStart);
  const windowEndDate = parseLocalDate(windowEnd);
  windowEndDate.setDate(windowEndDate.getDate() + 1); // exclusive upper bound

  try {
    // Fetch processes with eligible KPIs
    const processes = await prisma.process.findMany({
      where: {
        assigneeId: auth.userId,
        cadence: { in: cadences },
        OR: [
          { nextDueAt: null }, // no due date set
          { nextDueAt: { gte: windowStartDate, lt: windowEndDate } }, // due within window
          { nextDueAt: { lt: windowStartDate } }, // overdue (past due date)
        ],
      },
      include: {
        kpis: true,
      },
    });

    // Filter to only processes with at least one KPI
    const filtered = processes.filter((p) => (p as any).kpis && (p as any).kpis.length > 0);

    // Format response as { process, kpis }
    const result = filtered.map((p) => ({
      process: p,
      kpis: (p as any).kpis || [],
    }));

    return Response.json(result);
  } catch (err) {
    console.error('Error fetching due processes:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
