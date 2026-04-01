'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiProjectionProps {
  aggregatedValue: number;
  targetValue: number;
  daysElapsed: number;
  totalDays: number;
  unit: string | null;
}

function formatValue(value: number, unit: string | null): string {
  const rounded = Math.round(value * 10) / 10;
  if (!unit) return String(rounded);
  if (unit === '$') return `$${rounded.toLocaleString()}`;
  return `${rounded.toLocaleString()} ${unit}`;
}

type ProjectionStatus = 'on-track' | 'at-risk' | 'behind';

const STATUS_STYLES: Record<ProjectionStatus, { colorClass: string; icon: typeof TrendingUp }> = {
  'on-track': { colorClass: 'text-green-400 bg-green-500/10 border-green-500/20', icon: TrendingUp },
  'at-risk': { colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Minus },
  'behind': { colorClass: 'text-red-400 bg-red-500/10 border-red-500/20', icon: TrendingDown },
};

function getProjectionStatus(projectedPct: number): ProjectionStatus {
  if (projectedPct >= 100) return 'on-track';
  if (projectedPct >= 70) return 'at-risk';
  return 'behind';
}

export function KpiProjection({
  aggregatedValue,
  targetValue,
  daysElapsed,
  totalDays,
  unit,
}: KpiProjectionProps) {
  if (daysElapsed <= 0 || targetValue <= 0) return null;

  const currentPace = aggregatedValue / daysElapsed;
  const projectedTotal = currentPace * totalDays;
  const projectedPct = Math.round((projectedTotal / targetValue) * 100);

  const { colorClass, icon: Icon } = STATUS_STYLES[getProjectionStatus(projectedPct)];

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${colorClass}`}>
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <p className="text-sm font-medium">
        At current pace, you&apos;ll reach{' '}
        <span className="font-bold">{projectedPct}%</span> of target
        {' '}({formatValue(projectedTotal, unit)} / {formatValue(targetValue, unit)})
      </p>
    </div>
  );
}
