'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

interface KpiEditorProps {
  goalId: string;
  goalLevel: string;
  parentGoalId?: string | null;
  kpi?: any;
  onSave: () => void;
  onClose: () => void;
}

export function KpiEditor({
  goalId,
  goalLevel,
  parentGoalId,
  kpi,
  onSave,
  onClose,
}: KpiEditorProps) {
  const isEditing = !!kpi;

  const [name, setName] = useState(kpi?.name ?? '');
  const [type, setType] = useState<'NUMERIC' | 'BINARY'>(kpi?.type ?? 'NUMERIC');
  const [unit, setUnit] = useState(kpi?.unit ?? '');
  const [target, setTarget] = useState(kpi?.targetValue ?? '');
  const [linkedMonthlyKpiId, setLinkedMonthlyKpiId] = useState(kpi?.linkedKpiId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const linkableLevels = ['WEEKLY', 'MONTHLY', 'STRATEGIC'];
  const showLinkDropdown = linkableLevels.includes(goalLevel) && parentGoalId;

  const parentLevelLabel: Record<string, string> = {
    WEEKLY: 'Monthly',
    MONTHLY: 'Yearly',
    STRATEGIC: 'HHG',
  };

  const { data: parentKpis } = useSWR(
    showLinkDropdown ? `/api/goals/${parentGoalId}/kpis` : null,
    fetcher
  );

  const matchingParentKpis = parentKpis?.kpis?.filter?.(
    (pk: any) => pk.type === type
  ) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, any> = { name, type };
      if (type === 'NUMERIC') {
        body.unit = unit || null;
        body.targetValue = parseFloat(target);
      }
      if (showLinkDropdown && linkedMonthlyKpiId) {
        body.linkedKpiId = linkedMonthlyKpiId;
      }

      if (isEditing) {
        const res = await fetch(`/api/kpis/${kpi.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update KPI');
        }
      } else {
        const res = await fetch(`/api/goals/${goalId}/kpis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create KPI');
        }
      }

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
              {isEditing ? 'Edit KPI' : 'New KPI'}
            </h2>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="e.g., Revenue Target"
              />
            </div>

            {!isEditing && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Type</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="kpi-type"
                      value="NUMERIC"
                      checked={type === 'NUMERIC'}
                      onChange={() => setType('NUMERIC')}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-[var(--text-primary)]">Numeric</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="kpi-type"
                      value="BINARY"
                      checked={type === 'BINARY'}
                      onChange={() => setType('BINARY')}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-[var(--text-primary)]">Binary</span>
                  </label>
                </div>
              </div>
            )}

            {type === 'NUMERIC' && (
              <>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    placeholder='e.g., "$", "calls", "locations"'
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Target Value</label>
                  <input
                    type="number"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    placeholder="e.g., 4000"
                  />
                </div>
              </>
            )}

            {showLinkDropdown && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Link to {parentLevelLabel[goalLevel] ?? 'Parent'} KPI
                </label>
                <select
                  value={linkedMonthlyKpiId}
                  onChange={(e) => setLinkedMonthlyKpiId(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">None</option>
                  {matchingParentKpis.map((pk: any) => (
                    <option key={pk.id} value={pk.id}>
                      {pk.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                disabled={saving || !name || (type === 'NUMERIC' && !target)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
