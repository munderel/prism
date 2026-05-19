'use client';

import { useState, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getChildLevel } from '@/lib/goal-validation';
import { LEVEL_LABELS, formatGoalDateRange } from '@/lib/goal-constants';
import { GoalCreationCoach } from '@/components/reviews/shared/GoalCreationCoach';
import { getWeekBoundaries, toDateOnlyInputValue } from '@/lib/date-utils';

/** Compute the appropriate root goal level based on the date range duration. */
function computeRootLevel(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return 'HIGH_HARD';
  const s = new Date(startDate);
  const e = new Date(endDate);
  const durationDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  if (durationDays <= 14) return 'WEEKLY';
  if (s.getFullYear() === e.getFullYear()) return 'MONTHLY';
  return 'HIGH_HARD';
}

interface GoalEditorProps {
  stackId: string;
  parentGoal?: any;
  goal?: any; // If editing an existing goal
  onSave: () => void;
  onClose: () => void;
}

export function GoalEditor({
  stackId,
  parentGoal,
  goal,
  onSave,
  onClose,
}: GoalEditorProps) {
  const isEditing = !!goal;
  const childLevel = parentGoal ? getChildLevel(parentGoal.level) : null;

  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [status, setStatus] = useState(goal?.status ?? 'NOT_STARTED');
  const [startDate, setStartDate] = useState(() => {
    if (goal?.startDate) return toDateOnlyInputValue(goal.startDate);
    if (childLevel === 'WEEKLY') return getWeekBoundaries().start;
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    if (goal?.endDate) return toDateOnlyInputValue(goal.endDate);
    if (childLevel === 'WEEKLY') return getWeekBoundaries().end;
    return '';
  });
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCoach, setShowCoach] = useState(false);

  // For child goals, derive from parent; for root goals, compute from date range
  const derivedLevel = parentGoal
    ? getChildLevel(parentGoal.level)
    : isEditing
      ? goal?.level ?? 'HIGH_HARD'
      : computeRootLevel(startDate, endDate);

  const isRootGoal = !parentGoal && !isEditing;
  const showDates = isRootGoal || derivedLevel === 'WEEKLY' || (isEditing && (goal?.startDate || goal?.endDate));
  const canAutoGenerate = isRootGoal && derivedLevel !== 'WEEKLY';

  const durationLabel = useMemo(() => {
    if (!showDates || !startDate || !endDate) return null;
    return formatGoalDateRange(derivedLevel, startDate, endDate);
  }, [showDates, startDate, endDate, derivedLevel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, any> = { title, description, status };

      if (isEditing) {
        if (startDate) body.startDate = startDate;
        if (endDate) body.endDate = endDate;
        const res = await fetch(`/api/goals/${goal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update goal');
        }
      } else {
        body.stackId = stackId;
        body.level = derivedLevel;
        if (parentGoal) body.parentId = parentGoal.id;
        if (startDate) body.startDate = startDate;
        if (endDate) body.endDate = endDate;
        if (isRootGoal) {
          if (autoGenerate && startDate && endDate && derivedLevel !== 'WEEKLY') {
            body.autoGenerate = true;
          }
        }

        const res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create goal');
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
              {isEditing ? 'Edit Goal' : 'New Goal'}
            </h2>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          {derivedLevel && (
            <div className="mb-4">
              <span className="text-xs text-[var(--text-secondary)]">Level: </span>
              <span className="text-xs font-medium text-prism-indigo">
                {LEVEL_LABELS[derivedLevel] ?? derivedLevel}
              </span>
            </div>
          )}

          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Title <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="What do you want to achieve?"
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Optional details..."
              />
            </div>

            {isEditing && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ABANDONED">Abandoned</option>
                </select>
              </div>
            )}

            {/* Date pickers: required for new root goals, optional for editing goals with existing dates */}
            {showDates && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">
                      Start Date {isRootGoal && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required={isRootGoal}
                      className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">
                      End Date {isRootGoal && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required={isRootGoal}
                      className="w-full rounded-lg border border-white/[0.08] bg-[var(--hover-bg)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                {durationLabel && (
                  <p className="text-xs text-purple-400/80 -mt-2">{durationLabel}</p>
                )}
                {canAutoGenerate && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoGenerate}
                      onChange={(e) => setAutoGenerate(e.target.checked)}
                      className="rounded border-white/20 bg-[var(--hover-bg)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-[var(--text-secondary)]">
                      Auto-generate sub-goals
                    </span>
                  </label>
                )}
              </>
            )}

            <GoalCreationCoach
              goalLevel={derivedLevel as 'HIGH_HARD' | 'STRATEGIC' | 'MONTHLY' | 'WEEKLY'}
              isOpen={showCoach}
              onToggle={() => setShowCoach(!showCoach)}
            />

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
                disabled={saving || !title}
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
