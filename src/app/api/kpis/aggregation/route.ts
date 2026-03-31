import { NextRequest } from 'next/server';
import { KpiTimeLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';
import {
  getDateRangeForTimeLevel,
  getSubPeriodBoundaries,
  aggregateEntries,
} from '@/lib/kpi-aggregation';

// ─── Response types ───────────────────────────────────────────────────────────

interface SubPeriod {
  label: string;
  start: string;
  end: string;
  aggregatedValue: number;
  targetValue: number | null;
  progressPct: number | null;
}

interface KpiAggregation {
  kpiId: string;
  kpiName: string;
  unit: string | null;
  timeLevel: string;
  aggregatedValue: number;
  targetValue: number | null;
  progressPct: number | null;
  entryCount: number;
  subPeriods: SubPeriod[];
}

interface ProcessKpiAggregation {
  processId: string;
  processName: string;
  functionName: string;
  assignee: { id: string; name: string | null } | null;
  kpis: KpiAggregation[];
}

/** Returns progress as a percentage, or null when there is no valid target. */
function progressPct(value: number, target: number | null): number | null {
  if (target == null || target === 0) return null;
  return (value / target) * 100;
}

/** Maps a parent time level to its sub-period time level. */
function getSubTimeLevel(parent: KpiTimeLevel): KpiTimeLevel | null {
  if (parent === KpiTimeLevel.MONTHLY) return KpiTimeLevel.WEEKLY;
  if (parent === KpiTimeLevel.YEARLY) return KpiTimeLevel.MONTHLY;
  return null;
}

// ─── GET /api/kpis/aggregation ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const { searchParams } = request.nextUrl;

  // ── Parse + validate timeLevel ────────────────────────────────────────────
  const timeLevelParam = searchParams.get('timeLevel');
  const validTimeLevels = Object.values(KpiTimeLevel) as string[];

  if (!timeLevelParam || !validTimeLevels.includes(timeLevelParam)) {
    return Response.json(
      { error: `timeLevel is required and must be one of: ${validTimeLevels.join(', ')}` },
      { status: 400 },
    );
  }
  const timeLevel = timeLevelParam as KpiTimeLevel;

  // ── Parse start/end dates (fall back to computed range) ───────────────────
  let startDate = searchParams.get('startDate');
  let endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    const computed = getDateRangeForTimeLevel(timeLevel);
    startDate = startDate ?? computed.start;
    endDate = endDate ?? computed.end;
  }

  // Basic YYYY-MM-DD validation
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
    return Response.json(
      { error: 'startDate and endDate must be in YYYY-MM-DD format' },
      { status: 400 },
    );
  }

  // ── Optional filters ──────────────────────────────────────────────────────
  const filterUserId = searchParams.get('userId');
  const filterProcessId = searchParams.get('processId');
  const filterAssigneeId = searchParams.get('assigneeId');

  // ── Query ProcessKpis ─────────────────────────────────────────────────────
  const kpis = await prisma.processKpi.findMany({
    where: {
      ...(filterProcessId && { processId: filterProcessId }),
      ...(filterAssigneeId && { process: { assigneeId: filterAssigneeId } }),
    },
    include: {
      goals: true,
      process: {
        include: {
          function: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ processId: 'asc' }, { name: 'asc' }],
  });

  const meta = { timeLevel, startDate, endDate, userId: filterUserId, assigneeId: filterAssigneeId };

  if (kpis.length === 0) {
    return Response.json({ processes: [], meta });
  }

  // ── Query entries in date range ───────────────────────────────────────────
  const kpiIds = kpis.map((k) => k.id);

  const entries = await prisma.processKpiEntry.findMany({
    where: {
      kpiId: { in: kpiIds },
      date: {
        gte: new Date(startDate + 'T00:00:00'),
        lte: new Date(endDate + 'T23:59:59'),
      },
      ...(filterUserId && { userId: filterUserId }),
    },
    select: { kpiId: true, value: true, date: true },
  });

  // ── Index entries by kpiId for efficient look-up ──────────────────────────
  const entriesByKpiId = new Map<string, { value: number; date: Date }[]>();
  for (const entry of entries) {
    const list = entriesByKpiId.get(entry.kpiId) ?? [];
    list.push({ value: entry.value, date: entry.date });
    entriesByKpiId.set(entry.kpiId, list);
  }

  // ── Build sub-period boundaries once (same for all KPIs) ─────────────────
  const subPeriodBoundaries = getSubPeriodBoundaries(timeLevel, startDate, endDate);

  // ── Aggregate per KPI and group by process ────────────────────────────────
  const processMap = new Map<string, ProcessKpiAggregation>();

  for (const kpi of kpis) {
    const kpiEntries = entriesByKpiId.get(kpi.id) ?? [];

    const aggregatedValue = kpiEntries.reduce((sum, e) => sum + e.value, 0);
    const targetValue = kpi.goals.find((g) => g.timeLevel === timeLevel)?.targetValue ?? null;

    // Sub-periods -- use the finer-grained target (WEEKLY for month subs, MONTHLY for year subs)
    let subPeriods: SubPeriod[] = [];
    if (subPeriodBoundaries.length > 0) {
      const subTimeLevel = getSubTimeLevel(timeLevel);
      const subTargetValue = subTimeLevel
        ? kpi.goals.find((g) => g.timeLevel === subTimeLevel)?.targetValue ?? null
        : null;

      const buckets = aggregateEntries(kpiEntries, subPeriodBoundaries);
      subPeriods = subPeriodBoundaries.map((boundary, i) => ({
        label: boundary.label,
        start: boundary.start,
        end: boundary.end,
        aggregatedValue: buckets[i],
        targetValue: subTargetValue,
        progressPct: progressPct(buckets[i], subTargetValue),
      }));
    }

    const kpiAggregation: KpiAggregation = {
      kpiId: kpi.id,
      kpiName: kpi.name,
      unit: kpi.unit ?? null,
      timeLevel,
      aggregatedValue,
      targetValue,
      progressPct: progressPct(aggregatedValue, targetValue),
      entryCount: kpiEntries.length,
      subPeriods,
    };

    // Group under process
    const proc = kpi.process;
    if (!processMap.has(proc.id)) {
      processMap.set(proc.id, {
        processId: proc.id,
        processName: proc.title,
        functionName: proc.function.name,
        assignee: proc.assignee
          ? { id: proc.assignee.id, name: proc.assignee.name }
          : null,
        kpis: [],
      });
    }
    processMap.get(proc.id)!.kpis.push(kpiAggregation);
  }

  const processes = Array.from(processMap.values());

  return Response.json({ processes, meta });
}
