'use client';

import type { Kpi } from './review-types';

interface KpiProgressStepProps {
  kpis: Kpi[];
  onUpdate: (id: string, value: number) => void;
  emptyMessage?: string;
}

export function KpiProgressStep({
  kpis,
  onUpdate,
  emptyMessage = 'No KPIs found for your goals.',
}: KpiProgressStepProps) {
  if (kpis.length === 0) {
    return <p className="text-[var(--text-muted)] text-sm italic">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {kpis.map((kpi) => {
        const progress = kpi.targetValue && kpi.actualValue
          ? Math.min(100, Math.round((kpi.actualValue / kpi.targetValue) * 100))
          : 0;
        return (
          <div key={kpi.id} className="rounded-lg border border-[var(--border-color)] px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">{kpi.name}</p>
              {kpi.targetValue !== null && (
                <span className="text-xs text-[var(--text-muted)]">
                  Target: {kpi.targetValue}{kpi.unit ? ` ${kpi.unit}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={kpi.actualValue ?? ''}
                onChange={(e) => onUpdate(kpi.id, parseFloat(e.target.value) || 0)}
                className="w-28 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="Actual"
              />
              {kpi.unit && <span className="text-xs text-[var(--text-muted)]">{kpi.unit}</span>}
              <div className="flex-1 h-2 rounded-full bg-[var(--surface-raised)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    progress >= 100 ? 'bg-green-500' : progress >= 70 ? 'bg-indigo-500' : progress >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-[var(--text-muted)] w-10 text-right">{progress}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
