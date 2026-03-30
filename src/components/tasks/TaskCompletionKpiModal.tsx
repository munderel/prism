'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m, AnimatePresence } from 'framer-motion';
import { fetcher } from '@/lib/fetcher';
import { useToast } from '@/components/ui/ToastProvider';
import { getLocalDateString } from '@/lib/date-utils';

interface ProcessKpi {
  id: string;
  name: string;
  unit: string | null;
}

interface KpiRowState {
  value: string;
  notes: string;
}

interface TaskCompletionKpiModalProps {
  processId: string;
  processTitle: string;
  onClose: () => void;
}

export function TaskCompletionKpiModal({
  processId,
  processTitle,
  onClose,
}: TaskCompletionKpiModalProps) {
  const toast = useToast();
  const { data, isLoading } = useSWR<ProcessKpi[]>(
    `/api/processes/${processId}/kpis`,
    fetcher
  );
  const kpis: ProcessKpi[] = data ?? [];

  const [rows, setRows] = useState<Record<string, KpiRowState>>({});
  const [saving, setSaving] = useState(false);

  const getRow = (kpiId: string): KpiRowState =>
    rows[kpiId] ?? { value: '', notes: '' };

  const setRowField = (
    kpiId: string,
    field: keyof KpiRowState,
    val: string
  ) => {
    setRows((prev) => ({
      ...prev,
      [kpiId]: { ...getRow(kpiId), ...prev[kpiId], [field]: val },
    }));
  };

  const handleSave = async () => {
    const toPost = kpis.filter((kpi) => {
      const val = getRow(kpi.id).value;
      return val.trim() !== '' && !isNaN(parseFloat(val));
    });

    if (toPost.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    const today = getLocalDateString();
    const results = await Promise.allSettled(
      toPost.map((kpi) => {
        const row = getRow(kpi.id);
        return fetch(`/api/processes/${processId}/kpis/${kpi.id}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value: parseFloat(row.value),
            date: today,
            notes: row.notes.trim() || undefined,
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Failed to log ${kpi.name}`);
          }
        });
      })
    );
    setSaving(false);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      toast.error(
        `${failed.length} KPI${failed.length > 1 ? 's' : ''} failed to save`
      );
    } else {
      toast.success(
        `${toPost.length} KPI entr${toPost.length > 1 ? 'ies' : 'y'} logged`
      );
    }

    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        {/* Backdrop — click to skip */}
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0"
          onClick={onClose}
        />

        {/* Panel */}
        <m.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative glass-panel p-6 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        >
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-base font-semibold font-display text-[var(--text-primary)]">
              Log KPIs — {processTitle}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Task marked complete. Optionally log KPI values for this run.
            </p>
          </div>

          {/* KPI rows */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
            {isLoading && (
              <p className="text-sm text-[var(--text-muted)]">Loading KPIs…</p>
            )}

            {!isLoading && kpis.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No KPIs found.</p>
            )}

            {kpis.map((kpi) => {
              const row = getRow(kpi.id);
              return (
                <div key={kpi.id} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {kpi.name}
                    </span>
                    {kpi.unit && (
                      <span className="text-xs text-[var(--text-muted)]">
                        ({kpi.unit})
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      value={row.value}
                      onChange={(e) =>
                        setRowField(kpi.id, 'value', e.target.value)
                      }
                      placeholder={kpi.unit ? `Value (${kpi.unit})` : 'Value'}
                      className="w-32 rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) =>
                        setRowField(kpi.id, 'notes', e.target.value)
                      }
                      placeholder="Notes (optional)"
                      className="flex-1 rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={saving || isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        </m.div>
      </div>
    </AnimatePresence>
  );
}
