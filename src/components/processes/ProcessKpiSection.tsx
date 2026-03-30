'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { useToast } from '@/components/ui/ToastProvider';
import { KpiProgressBar } from '@/components/goals/KpiProgressBar';
import { ProcessKpiEditor } from './ProcessKpiEditor';
import { ProcessKpiEntryLogger } from './ProcessKpiEntryLogger';

const TIME_LEVEL_SHORT: Record<string, string> = {
  WEEKLY: 'W',
  MONTHLY: 'M',
  YEARLY: 'Y',
  FIVE_YEAR: '5Y',
  HHG: 'HHG',
};

interface ProcessKpiSectionProps {
  processId: string;
  isAdmin: boolean;
}

export function ProcessKpiSection({ processId, isAdmin }: ProcessKpiSectionProps) {
  const toast = useToast();

  const {
    data,
    isLoading,
    mutate,
  } = useSWR(`/api/processes/${processId}/kpis`, fetcher);

  const kpis: any[] = data ?? [];

  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingKpi, setEditingKpi] = useState<any | null>(null);

  const toggleExpand = (kpiId: string) => {
    setExpandedKpiId((prev) => (prev === kpiId ? null : kpiId));
  };

  const handleAddClick = () => {
    setEditingKpi(null);
    setShowEditor(true);
  };

  const handleEditClick = (kpi: any) => {
    setEditingKpi(kpi);
    setShowEditor(true);
  };

  const handleEditorSave = () => {
    setShowEditor(false);
    setEditingKpi(null);
    mutate();
  };

  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingKpi(null);
  };

  const handleDelete = async (kpiId: string) => {
    if (!confirm('Delete this KPI and all its entries?')) return;
    try {
      const res = await fetch(`/api/processes/${processId}/kpis/${kpiId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete KPI');
      }
      toast.success('KPI deleted');
      mutate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase">
          KPIs{' '}
          {!isLoading && (
            <span className="text-[var(--text-muted)]">({kpis.length})</span>
          )}
        </h4>
        {isAdmin && (
          <button
            onClick={handleAddClick}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add KPI
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-[var(--text-muted)]">Loading KPIs…</p>
      )}

      {!isLoading && kpis.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No KPIs defined yet.</p>
      )}

      <div className="space-y-2">
        {kpis.map((kpi: any) => {
          const isExpanded = expandedKpiId === kpi.id;
          const entries: any[] = kpi.entries ?? [];
          const lastEntry = entries[0];

          // Compute a simple progress for the latest entry vs. the default target
          const hasTarget = kpi.targetValue != null && kpi.targetValue > 0;
          const lastValue = lastEntry?.value ?? null;

          return (
            <div
              key={kpi.id}
              className="group glass-panel p-3 mb-2"
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => toggleExpand(kpi.id)}
                    className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {kpi.name}
                  </span>
                  {kpi.unit && (
                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                      ({kpi.unit})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Time-level goal pills */}
                  {(kpi.goals ?? []).map((g: any) => (
                    <span
                      key={g.timeLevel}
                      className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300 whitespace-nowrap"
                    >
                      {TIME_LEVEL_SHORT[g.timeLevel] ?? g.timeLevel}:{g.targetValue}
                    </span>
                  ))}

                  {/* Edit / Delete — visible on hover (admin only) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditClick(kpi)}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)] transition-colors"
                        title="Edit KPI"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(kpi.id)}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-red-400 transition-colors"
                        title="Delete KPI"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mini progress bar when we have a target + last entry */}
              {hasTarget && lastValue != null && (
                <div className="mt-2 pl-6">
                  <KpiProgressBar
                    actual={lastValue}
                    target={kpi.targetValue}
                    unit={kpi.unit ?? null}
                    showValues
                  />
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                    Last entry: {lastValue}{kpi.unit ? ` ${kpi.unit}` : ''}
                    {lastEntry?.date
                      ? ` on ${new Date(lastEntry.date).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
              )}

              {/* Expandable section */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <m.div
                    key="expanded"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pl-6 space-y-3">
                      {/* Entry logger */}
                      <ProcessKpiEntryLogger
                        processId={processId}
                        kpiId={kpi.id}
                        unit={kpi.unit}
                        onLogged={() => mutate()}
                      />

                      {/* Entry history */}
                      {entries.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">
                            Recent Entries
                          </p>
                          <div className="space-y-1">
                            {entries.slice(0, 10).map((entry: any) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between text-xs text-[var(--text-secondary)] py-0.5"
                              >
                                <span className="font-medium text-[var(--text-primary)]">
                                  {entry.value}
                                  {kpi.unit ? ` ${kpi.unit}` : ''}
                                </span>
                                <span className="text-[var(--text-muted)]">
                                  {entry.date
                                    ? new Date(entry.date).toLocaleDateString()
                                    : '—'}
                                </span>
                                {entry.notes && (
                                  <span className="max-w-[160px] truncate text-[var(--text-muted)] italic">
                                    {entry.notes}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">No entries yet.</p>
                      )}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* KPI editor modal */}
      {showEditor && (
        <ProcessKpiEditor
          processId={processId}
          kpi={editingKpi}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
        />
      )}
    </div>
  );
}
