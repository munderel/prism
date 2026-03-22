'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getChildLevel } from '@/lib/goal-validation';

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
  const derivedLevel = parentGoal
    ? getChildLevel(parentGoal.level)
    : 'HIGH_HARD';

  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [status, setStatus] = useState(goal?.status ?? 'NOT_STARTED');
  const [dueDate, setDueDate] = useState(
    goal?.dueDate ? new Date(goal.dueDate).toISOString().split('T')[0] : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body: Record<string, any> = { title, description, status };
      if (dueDate) body.dueDate = dueDate;

      if (isEditing) {
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Goal' : 'New Goal'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {derivedLevel && (
            <div className="mb-4">
              <span className="text-xs text-gray-400">Level: </span>
              <span className="text-xs font-medium text-indigo-400">
                {derivedLevel}
              </span>
            </div>
          )}

          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="What do you want to achieve?"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Optional details..."
              />
            </div>

            {isEditing && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ABANDONED">Abandoned</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
