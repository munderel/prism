'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

const TIME_LEVELS = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
  { key: 'FIVE_YEAR', label: '5-Year' },
  { key: 'HHG', label: 'HHG' },
] as const;

type TimeLevelKey = (typeof TIME_LEVELS)[number]['key'];

interface ProcessKpiEditorProps {
  processId: string;
  kpi?: any; // existing KPI when editing
  onSave: () => void;
  onClose: () => void;
}

export function ProcessKpiEditor({
  processId,
  kpi,
  onSave,
  onClose,
}: ProcessKpiEditorProps) {
  const isEditing = !!kpi;
  const toast = useToast();

  const [name, setName] = useState<string>(kpi?.name ?? '');
  const [unit, setUnit] = useState<string>(kpi?.unit ?? '');
  const [defaultTarget, setDefaultTarget] = useState<string>(
    kpi?.targetValue != null ? String(kpi.targetValue) : ''
  );

  // Build initial goal map from existing goals array
  const initialGoals: Record<TimeLevelKey, string> = TIME_LEVELS.reduce(
    (acc, tl) => {
      const existing = kpi?.goals?.find((g: any) => g.timeLevel === tl.key);
      acc[tl.key] = existing?.targetValue != null ? String(existing.targetValue) : '';
      return acc;
    },
    {} as Record<TimeLevelKey, string>
  );
  const [goals, setGoals] = useState<Record<TimeLevelKey, string>>(initialGoals);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setGoal = (key: TimeLevelKey, val: string) => {
    setGoals((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const goalsArray = TIME_LEVELS.filter((tl) => goals[tl.key] !== '').map((tl) => ({
        timeLevel: tl.key,
        targetValue: parseFloat(goals[tl.key]),
      }));

      const body: Record<string, any> = {
        name: name.trim(),
        unit: unit.trim() || null,
        goals: goalsArray,
      };

      if (defaultTarget !== '') {
        body.targetValue = parseFloat(defaultTarget);
      }

      const url = isEditing
        ? `/api/processes/${processId}/kpis/${kpi.id}`
        : `/api/processes/${processId}/kpis`;
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} KPI`);
      }

      toast.success(isEditing ? 'KPI updated' : 'KPI created');
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <m.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg glass-panel p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              {isEditing ? 'Edit Process KPI' : 'New Process KPI'}
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g., Calls Made"
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder='e.g., "calls", "$"'
                  className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Default Target
                </label>
                <input
                  type="number"
                  value={defaultTarget}
                  onChange={(e) => setDefaultTarget(e.target.value)}
                  step="any"
                  placeholder="e.g., 20"
                  className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Time-Level Goals
              </label>
              <div className="grid grid-cols-5 gap-2">
                {TIME_LEVELS.map((tl) => (
                  <div key={tl.key} className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-muted)] text-center">{tl.label}</span>
                    <input
                      type="number"
                      value={goals[tl.key]}
                      onChange={(e) => setGoal(tl.key, e.target.value)}
                      step="any"
                      placeholder="—"
                      className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-2 py-2 text-[var(--text-primary)] text-sm text-center focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
