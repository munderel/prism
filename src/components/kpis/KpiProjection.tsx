'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { m } from 'framer-motion';

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

const STATUS_STYLES: Record<
  ProjectionStatus,
  { colorClass: string; iconBg: string; icon: typeof TrendingUp }
> = {
  'on-track': {
    colorClass: 'text-green-400 bg-green-500/10 border-green-500/20',
    iconBg: 'bg-green-500/15',
    icon: TrendingUp,
  },
  'at-risk': {
    colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    iconBg: 'bg-amber-500/15',
    icon: Minus,
  },
  'behind': {
    colorClass: 'text-red-400 bg-red-500/10 border-red-500/20',
    iconBg: 'bg-red-500/15',
    icon: TrendingDown,
  },
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

  const { colorClass, iconBg, icon: Icon } = STATUS_STYLES[getProjectionStatus(projectedPct)];

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border px-5 py-4 ${colorClass}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">
            End-of-period projection
          </p>
          <p className="font-display text-lg font-bold tabular-nums leading-none">
            {projectedPct}% of target
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] opacity-60 mb-0.5">Projected total</p>
          <p className="text-sm font-semibold tabular-nums">
            {formatValue(projectedTotal, unit)}
            <span className="opacity-50"> / {formatValue(targetValue, unit)}</span>
          </p>
        </div>
      </div>
      <p className="mt-2.5 text-xs opacity-50 border-t border-current/10 pt-2">
        {daysElapsed} of {totalDays} days elapsed
      </p>
    </m.div>
  );
}
