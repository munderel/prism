'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { ProcessKpiEntryLogger } from '@/components/processes/ProcessKpiEntryLogger';

interface ProcessKpiLogStepProps {
  processes: Array<{ process: any; kpis: any[] }>;
  date: string; // YYYY-MM-DD
}

/**
 * Shared KPI logging step for PowerDown and review wizards.
 * Groups processes by cadence and renders KPI entry loggers.
 */
export function ProcessKpiLogStep({ processes, date }: ProcessKpiLogStepProps) {
  // Group processes by cadence
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const item of processes) {
      const cadence = item.process.cadence;
      if (!groups[cadence]) groups[cadence] = [];
      groups[cadence].push(item);
    }
    return groups;
  }, [processes]);

  // Cadence labels for display
  const cadenceLabels: Record<string, string> = {
    DAILY: 'Daily Processes',
    WEEKLY: 'Weekly Processes',
    BIWEEKLY: 'Biweekly Processes',
    MONTHLY: 'Monthly Processes',
    QUARTERLY: 'Quarterly Processes',
    YEARLY: 'Yearly Processes',
    ONE_TIME: 'One-Time Processes',
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Log KPI progress for processes scheduled or due in this period.
      </p>

      {processes.length === 0 ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/50 px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">No processes with KPIs are due in this period.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cadence, items]) => (
          <div key={cadence} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {cadenceLabels[cadence] || cadence}
            </h3>
            {items.map(({ process, kpis }) => (
              <div key={process.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{process.title}</p>
                    {process.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{process.description}</p>
                    )}
                  </div>
                </div>

                {kpis.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] ml-6">No KPIs defined for this process.</p>
                ) : (
                  <div className="ml-6 space-y-3">
                    {kpis.map((kpi: any) => (
                      <ProcessKpiEntryLogger
                        key={kpi.id}
                        processId={process.id}
                        kpiId={kpi.id}
                        unit={kpi.unit}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
