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
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        {formatDateRangeLabel(timeLevel, dateRange.start, dateRange.end)}
      </p>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-indigo-500" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary stat cards */}
          <KpiDashboardSummary processes={processes} />

          {/* Process KPI rows */}
          {processes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-color)] px-6 py-16 text-center">
              <TrendingUp className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">
                No KPI data found for this period.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {processes.map((process) => (
                <div key={process.processId}>
                  <ProcessKpiRow process={process} />

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
