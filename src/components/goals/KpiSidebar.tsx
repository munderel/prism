'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, Plus, BarChart3 } from 'lucide-react';
import useSWR from 'swr';
import { KpiCard } from './KpiCard';
import { KpiEditor } from './KpiEditor';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const levelLabels: Record<string, string> = {
  HIGH_HARD: 'HHG',
  STRATEGIC: 'Yearly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
};

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

  const { data: kpis, mutate } = useSWR(
    `/api/goals/${goalId}/kpis`,
    fetcher
  );

  const handleUpdate = async (id: string, data: any) => {
    const res = await fetch(`/api/kpis/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update KPI');
    const result = await res.json();
    mutate();
    if (result.updatedLinkedKpi) {
      mutate();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/kpis/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete KPI');
    mutate();
  };

  const handleEditorSave = () => {
    setShowEditor(false);
    setEditingKpi(null);
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
        className="fixed top-0 right-0 h-full w-[340px] z-40 border-l border-white/[0.06] bg-gray-900/95 backdrop-blur-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              {levelLabels[goalLevel] ?? goalLevel} KPIs
            </span>
            <h3 className="text-sm font-medium text-white truncate mt-0.5">
              {goalTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-white ml-2 shrink-0"
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
              <BarChart3 className="h-8 w-8 text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">No KPIs yet</p>
              <p className="text-xs text-gray-600 mt-1">
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
        <div className="px-4 py-3 border-t border-white/[0.06]">
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
          onClose={() => {
            setShowEditor(false);
            setEditingKpi(null);
          }}
        />
      )}
    </>
  );
}
