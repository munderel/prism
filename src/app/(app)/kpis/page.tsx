'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { TrendingUp } from 'lucide-react';

import {
  getWeekBoundaries,
  getMonthBoundaries,
  getYearBoundaries,
  formatDisplayDate,
} from '@/lib/date-utils';
import { KpiDashboardHeader } from '@/components/kpis/KpiDashboardHeader';
import { KpiDashboardSummary } from '@/components/kpis/KpiDashboardSummary';
import { ProcessKpiRow } from '@/components/kpis/ProcessKpiRow';
import { KpiProjection } from '@/components/kpis/KpiProjection';
import { GoalScopedKpiSection } from '@/components/kpis/GoalScopedKpiSection';

// Load chart with SSR disabled
const KpiSubPeriodChart = dynamic(
  () => import('@/components/kpis/KpiSubPeriodChart').then((m) => m.KpiSubPeriodChart),
  { ssr: false },
);

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
  subPeriods?: SubPeriod[];
}

interface ProcessAggregation {
  processId: string;
  processName: string;
  functionName: string;
  assignee: { id: string; name: string | null } | null;
  kpis: KpiAggregation[];
}

interface AggregationResponse {
  processes: ProcessAggregation[];
  meta: {
    timeLevel: string;
    startDate: string;
    endDate: string;
    userId: string | null;
    assigneeId: string | null;
  };
}

interface GoalScopeKpi {
  id: string;
  name: string;
  type: string;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  completedAt: string | null;
  owner: { id: string; name: string | null; email: string; image: string | null } | null;
}

interface GoalScopeResponse {
  goal:
    | null
    | {
        id: string;
        title: string;
        level: string;
        status: 'IN_PROGRESS';
        startDate: string;
        endDate: string;
        progressPct: number;
        stack: { id: string; name: string };
      };
  kpis: GoalScopeKpi[];
  meta: { timeLevel: string; mappedLevel: string | null };
}

function formatDateRangeLabel(timeLevel: string, start: string, end: string): string {
  switch (timeLevel) {
    case 'WEEKLY':
      return `Week of ${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
    case 'MONTHLY':
      return `Month of ${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
    case 'YEARLY':
      return `Year ${start.split('-')[0]}`;
    default:
      return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  }
}

function computeDaysElapsed(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1); // at least 1 to avoid division by zero
}

function computeTotalDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export default function KpiDashboardPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [viewMode, setViewMode] = useState<'company' | 'individual'>('company');
  const [timeLevel, setTimeLevel] = useState('WEEKLY');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  const dateRange = useMemo(() => {
    switch (timeLevel) {
      case 'MONTHLY':
        return getMonthBoundaries();
      case 'YEARLY':
        return getYearBoundaries();
      default:
        return getWeekBoundaries();
    }
  }, [timeLevel]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      timeLevel,
      startDate: dateRange.start,
      endDate: dateRange.end,
    });
    if (viewMode === 'individual' && userId) p.set('userId', userId);
    if (assigneeFilter) p.set('assigneeId', assigneeFilter);
    return p.toString();
  }, [timeLevel, dateRange, viewMode, userId, assigneeFilter]);

  const { data, isLoading } = useSWR<AggregationResponse>(
    `/api/kpis/aggregation?${queryParams}`,
  );

  const { data: goalScopeData } = useSWR<GoalScopeResponse>(
    `/api/kpis/goal-scope?timeLevel=${timeLevel}`,
  );

  const processes = data?.processes ?? [];
  const showSubPeriods = timeLevel === 'MONTHLY' || timeLevel === 'YEARLY';

  // Aggregate all KPIs for the projection
  const allKpis = processes.flatMap((p) => p.kpis);
  const totalAggregated = allKpis.reduce((sum, k) => sum + k.aggregatedValue, 0);
  const totalTarget = allKpis.reduce((sum, k) => sum + (k.targetValue ?? 0), 0);
  const daysElapsed = computeDaysElapsed(dateRange.start);
  const totalDays = computeTotalDays(dateRange.start, dateRange.end);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Page title */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-indigo-400" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          KPI Dashboard
        </h1>
      </div>

      {/* Header controls */}
      <KpiDashboardHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        timeLevel={timeLevel}
        onTimeLevelChange={setTimeLevel}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
      />

      {/* Date range label */}
      <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--hover-bg)] px-2.5 py-1">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {formatDateRangeLabel(timeLevel, dateRange.start, dateRange.end)}
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          {/* Summary row skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-panel p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded progress-shimmer" />
                  <div className="h-7 w-7 rounded-lg progress-shimmer" />
                </div>
                <div className="h-8 w-10 rounded progress-shimmer" />
              </div>
            ))}
          </div>
          {/* Process row skeletons */}
          {[3, 2, 2].map((kpiCount, i) => (
            <div key={i} className="glass-panel p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="h-2.5 w-20 rounded progress-shimmer" />
                  <div className="h-4 w-36 rounded progress-shimmer" />
                </div>
                <div className="h-6 w-20 rounded-full progress-shimmer" />
              </div>
              {[...Array(kpiCount)].map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="h-3 w-48 rounded progress-shimmer" />
                  <div className="h-2 w-full rounded-full progress-shimmer" />
                  <div className="h-2.5 w-32 rounded progress-shimmer" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary stat cards */}
          <KpiDashboardSummary processes={processes} daysElapsed={daysElapsed} totalDays={totalDays} />

          {/* Current in-progress goal's KPIs (from the goal stack) */}
          {goalScopeData?.meta.mappedLevel && (
            <GoalScopedKpiSection
              goal={goalScopeData.goal}
              kpis={goalScopeData.kpis}
              mappedLevel={goalScopeData.meta.mappedLevel}
            />
          )}

          {/* Process KPI rows */}
          {processes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
                <TrendingUp className="h-6 w-6 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                No KPI data for this period
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-1">
                Try switching to a different time period or view mode.
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                KPIs are tracked per process — make sure KPIs are configured in your processes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {processes.map((process) => (
                <div key={process.processId}>
                  <ProcessKpiRow process={process} daysElapsed={daysElapsed} totalDays={totalDays} />

                  {/* Sub-period charts for Monthly / Yearly views */}
                  {showSubPeriods &&
                    process.kpis
                      .filter((kpi) => kpi.subPeriods && kpi.subPeriods.length > 0)
                      .map((kpi) => (
                        <div
                          key={kpi.kpiId}
                          className="mt-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4"
                        >
                          <KpiSubPeriodChart
                            subPeriods={kpi.subPeriods!}
                            unit={kpi.unit}
                            kpiName={kpi.kpiName}
                          />
                        </div>
                      ))}
                </div>
              ))}
            </div>
          )}

          {/* Projection */}
          {processes.length > 0 && totalTarget > 0 && (
            <KpiProjection
              aggregatedValue={totalAggregated}
              targetValue={totalTarget}
              daysElapsed={daysElapsed}
              totalDays={totalDays}
              unit={null}
            />
          )}
        </>
      )}
    </div>
  );
}
