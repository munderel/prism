'use client';

import { m } from 'framer-motion';
import { User } from 'lucide-react';
import { KpiProgressBar } from '@/components/goals/KpiProgressBar';

interface ProcessKpiRowProps {
  process: {
    processId: string;
    processName: string;
    functionName: string;
    assignee: { id: string; name: string | null } | null;
    kpis: Array<{
      kpiId: string;
      kpiName: string;
      unit: string | null;
      aggregatedValue: number;
      targetValue: number | null;
      progressPct: number | null;
      entryCount: number;
    }>;
  };
}

export function ProcessKpiRow({ process }: ProcessKpiRowProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4"
    >
      {/* Process header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-0.5">
            {process.functionName}
          </p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {process.processName}
          </h3>
        </div>
        {process.assignee && (
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--hover-bg)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            <User className="h-3 w-3" />
            {process.assignee.name ?? 'Unknown'}
          </span>
        )}
      </div>

      {/* KPI list */}
      {process.kpis.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">No KPIs tracked for this period.</p>
      ) : (
        <div className="space-y-4">
          {process.kpis.map((kpi) => (
            <div key={kpi.kpiId}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-[var(--text-primary)]">{kpi.kpiName}</span>
                {kpi.entryCount > 0 && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {kpi.entryCount} {kpi.entryCount === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>
              <KpiProgressBar
                actual={kpi.aggregatedValue}
                target={kpi.targetValue ?? 0}
                unit={kpi.unit}
                showValues
              />
            </div>
          ))}
        </div>
      )}
    </m.div>
  );
}
