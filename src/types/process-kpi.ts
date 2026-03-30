import { KpiTimeLevel } from '@prisma/client';

// ─── Raw model shapes (API response data) ────────────────────────────────────

export interface ProcessKpiGoalData {
  id: string;
  kpiId: string;
  timeLevel: KpiTimeLevel;
  targetValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessKpiEntryData {
  id: string;
  kpiId: string;
  userId: string;
  value: number;
  /** ISO date string or YYYY-MM-DD */
  date: string;
  notes: string | null;
  createdAt: string;
}

export interface ProcessKpiData {
  id: string;
  processId: string;
  name: string;
  unit: string | null;
  targetValue: number | null;
  goalId: string | null;
  createdAt: string;
  updatedAt: string;
  goals: ProcessKpiGoalData[];
  entries: ProcessKpiEntryData[];
}

// ─── Aggregation shapes (aggregation endpoint response) ──────────────────────

/** A single sub-period within an aggregation (e.g. one week within a month). */
export interface KpiSubPeriod {
  label: string;
  start: string;
  end: string;
  aggregatedValue: number | null;
  targetValue: number | null;
  progressPct: number | null;
}

/**
 * Aggregation result for a single KPI over a time period.
 * `subPeriods` is populated when the time level contains finer-grained periods
 * (e.g. a MONTHLY aggregation may include weekly sub-periods).
 */
export interface KpiAggregation {
  kpiId: string;
  kpiName: string;
  unit: string | null;
  timeLevel: KpiTimeLevel;
  /** Total / summed value across the period */
  aggregatedValue: number | null;
  /** Target from the matching ProcessKpiGoal (if any) */
  targetValue: number | null;
  /** 0–100, null when targetValue is null or zero */
  progressPct: number | null;
  subPeriods: KpiSubPeriod[];
}

/**
 * Aggregation result for all KPIs belonging to a single process.
 * This is the top-level shape returned by the aggregation endpoint.
 */
export interface ProcessKpiAggregation {
  processId: string;
  processName: string;
  kpis: KpiAggregation[];
}
