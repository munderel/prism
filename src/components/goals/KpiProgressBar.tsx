'use client';

import React from 'react';
import { m } from 'framer-motion';

interface KpiProgressBarProps {
  actual: number;
  target: number;
  unit: string | null;
  showValues?: boolean;
}

function getBarColor(pct: number): string {
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
}: KpiProgressBarProps) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
  const color = getBarColor(pct);

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
