'use client';

import React from 'react';
import { m } from 'framer-motion';

interface KpiProgressBarProps {
  actual: number;
  target: number;
  unit: string | null;
  showValues?: boolean;
  /** Days elapsed in the current period (enables projection-based coloring). */
  daysElapsed?: number;
  /** Total days in the current period (enables projection-based coloring). */
  totalDays?: number;
}

/**
 * Returns bar color based on projection status when time context is available,
 * otherwise falls back to raw progress thresholds.
 */
function getBarColor(actual: number, target: number, daysElapsed?: number, totalDays?: number): string {
  if (daysElapsed && totalDays && daysElapsed > 0 && target > 0) {
    const currentPace = actual / daysElapsed;
    const projectedTotal = currentPace * totalDays;
    const projectedPct = (projectedTotal / target) * 100;
    if (projectedPct >= 100) return '#10b981'; // green — on-track
    if (projectedPct >= 70) return '#f59e0b';  // amber — at-risk
    return '#ef4444';                           // red   — behind
  }
  // Fallback: raw progress (for contexts without time info, e.g. goal cards)
  const pct = target > 0 ? (actual / target) * 100 : 0;
  if (pct >= 70) return '#10b981';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

function formatValue(value: number, unit: string | null): string {
  if (!unit) return String(value);
  if (unit === '$') return `$${value.toLocaleString()}`;
  return `${value.toLocaleString()} ${unit}`;
}

export const KpiProgressBar = React.memo(function KpiProgressBar({
  actual,
  target,
  unit,
  showValues = true,
  daysElapsed,
  totalDays,
}: KpiProgressBarProps) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
  const color = getBarColor(actual, target, daysElapsed, totalDays);

  return (
    <div className="w-full">
      <div className="flex-1 rounded-full bg-white/[0.12] h-2">
        <m.div
          className="h-2 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: pct > 0 ? `0 0 8px ${color}40` : 'none',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {showValues && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">
            {formatValue(actual, unit)} / {formatValue(target, unit)}
          </span>
          <span className="text-xs tabular-nums font-medium text-[var(--text-secondary)]">{Math.round(pct)}%</span>
        </div>
      )}
    </div>
  );
});
