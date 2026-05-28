'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, BarChart3 } from 'lucide-react';
import useSWR, { useSWRConfig } from 'swr';
import { KpiCard } from './KpiCard';
import { KpiEditor } from './KpiEditor';
import { LEVEL_LABELS } from '@/lib/goal-constants';

interface KpiSidebarProps {
  goalId: string;
  goalTitle: string;
  goalLevel: string;
  parentGoalId?: string | null;
  onClose: () => void;
}

export function KpiSidebar({
  goalId,
  goalTitle,
  goalLevel,
  parentGoalId,
  onClose,
}: KpiSidebarProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingKpi, setEditingKpi] = useState<any>(null);

  const { data, mutate } = useSWR<{ kpis: any[] }>(
    `/api/goals/${goalId}/kpis`
  );
  const { mutate: globalMutate } = useSWRConfig();
  const kpis = data?.kpis;

  // Any KPI write can cascade up the link chain (weekly → monthly → strategic
  // → HHG), so refresh every cached `/api/goals/*/kpis` and `/api/kpis/*`
  // response, not just this sidebar's. Without this, a parent KPI's sidebar
  // or its AIM-contributions panel shows a stale value until the cache
  // expires or a re-render forces a refetch.
  const refreshAllKpiViews = () =>
    globalMutate(
      (key) => typeof key === 'string' && key.includes('/kpi'),
      undefined,
      { revalidate: true },
    );

  const handleUpdate = async (id: string, updatePayload: any) => {
    const res = await fetch(`/api/kpis/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });
    if (!res.ok) throw new Error('Failed to update KPI');
    await refreshAllKpiViews();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/kpis/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete KPI');
    await refreshAllKpiViews();
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingKpi(null);
  };

  const handleEditorSave = () => {
    closeEditor();
    mutate();
  };

  const handleEdit = (kpi: any) => {
    setEditingKpi(kpi);
    setShowEditor(true);
  };

  return (
    <>
      <m.div
        initial={{ x: 340, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 340, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
        className="fixed top-0 right-0 h-full w-[340px] z-40 border-l border-[var(--border-color)] bg-background/95 backdrop-blur-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              {LEVEL_LABELS[goalLevel] ?? goalLevel} KPIs
            </span>
            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate mt-0.5">
              {goalTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] ml-2 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable KPI list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!kpis ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
            </div>
          ) : kpis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-8 w-8 text-[var(--text-muted)] mb-2" />
              <p className="text-sm text-[var(--text-muted)]">No KPIs yet</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Add KPIs to track measurable outcomes for this goal.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {kpis.map((kpi: any) => (
                <KpiCard
                  key={kpi.id}
                  kpi={kpi}
                  onUpdate={handleUpdate}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={() => {
              setEditingKpi(null);
              setShowEditor(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add KPI
          </button>
        </div>
      </m.div>

      {/* KPI Editor Modal */}
      {showEditor && (
        <KpiEditor
          goalId={goalId}
          goalLevel={goalLevel}
          parentGoalId={parentGoalId}
          kpi={editingKpi}
          onSave={handleEditorSave}
          onClose={closeEditor}
        />
      )}
    </>
  );
}
