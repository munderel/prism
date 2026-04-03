'use client';

import { useState } from 'react';
import { m } from 'framer-motion';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { INPUT_CLASSES } from '@/lib/process-constants';
import { staggerContainer, staggerItem } from '@/lib/process-animations';
import type { Step } from '@/types/process';

interface StepsListProps {
  steps: Step[];
  processId: string;
  isAdmin: boolean;
  onAddStep: (title: string, description: string | null, url: string | null) => Promise<void>;
  onEditStep: (stepId: string, title: string, description: string | null, url: string | null) => Promise<void>;
  onDeleteStep: (stepId: string) => void;
}

export function StepsList({
  steps,
  isAdmin,
  onAddStep,
  onEditStep,
  onDeleteStep,
}: StepsListProps) {
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepDesc, setNewStepDesc] = useState('');
  const [newStepUrl, setNewStepUrl] = useState('');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editStepTitle, setEditStepTitle] = useState('');
  const [editStepDesc, setEditStepDesc] = useState('');
  const [editStepUrl, setEditStepUrl] = useState('');

  const handleAddStep = async () => {
    if (!newStepTitle.trim()) return;
    await onAddStep(
      newStepTitle.trim(),
      newStepDesc.trim() || null,
      newStepUrl.trim() || null
    );
    setNewStepTitle('');
    setNewStepDesc('');
    setNewStepUrl('');
    setShowAddStep(false);
  };

  const handleEditStep = async (stepId: string) => {
    await onEditStep(
      stepId,
      editStepTitle,
      editStepDesc || null,
      editStepUrl || null
    );
    setEditingStepId(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          SOP Steps
        </h4>
        {isAdmin && (
          <button
            onClick={() => setShowAddStep(true)}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Step
          </button>
        )}
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] py-2">No steps defined yet.</p>
      )}

      <m.ol
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="space-y-2"
      >
        {steps.map((step, idx) => (
          <m.li
            key={step.id}
            variants={staggerItem}
            className="flex items-start gap-3 glass-panel p-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-medium text-indigo-700 dark:text-indigo-400">
              {idx + 1}
            </span>
            {editingStepId === step.id ? (
              <div className="flex-1 space-y-2">
                <input
                  value={editStepTitle}
                  onChange={(e) => setEditStepTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditStep(step.id);
                    if (e.key === 'Escape') setEditingStepId(null);
                  }}
                  className={`w-full ${INPUT_CLASSES}`}
                  autoFocus
                />
                <input
                  value={editStepDesc}
                  onChange={(e) => setEditStepDesc(e.target.value)}
                  placeholder="Description"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditStep(step.id);
                  }}
                  className={`w-full ${INPUT_CLASSES}`}
                />
                <input
                  value={editStepUrl}
                  onChange={(e) => setEditStepUrl(e.target.value)}
                  placeholder="Link to SOP document (optional)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditStep(step.id);
                  }}
                  className={`w-full ${INPUT_CLASSES}`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditStep(step.id)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingStepId(null)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                {step.url ? (
                  <a
                    href={step.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 inline-flex items-center gap-1"
                  >
                    {step.title}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-[var(--text-primary)]">{step.title}</p>
                )}
                {step.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            )}
            {isAdmin && editingStepId !== step.id && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    setEditingStepId(step.id);
                    setEditStepTitle(step.title);
                    setEditStepDesc(step.description || '');
                    setEditStepUrl(step.url || '');
                  }}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDeleteStep(step.id)}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </m.li>
        ))}
      </m.ol>

      {/* Add step form */}
      {showAddStep && isAdmin && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 overflow-hidden"
        >
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <div className="space-y-2">
              <input
                type="text"
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
                placeholder="Step title"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddStep();
                  if (e.key === 'Escape') setShowAddStep(false);
                }}
                className={`w-full ${INPUT_CLASSES}`}
              />
              <input
                type="text"
                value={newStepDesc}
                onChange={(e) => setNewStepDesc(e.target.value)}
                placeholder="Description (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddStep();
                }}
                className={`w-full ${INPUT_CLASSES}`}
              />
              <input
                type="text"
                value={newStepUrl}
                onChange={(e) => setNewStepUrl(e.target.value)}
                placeholder="Link to SOP document (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddStep();
                }}
                className={`w-full ${INPUT_CLASSES}`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddStep}
                  disabled={!newStepTitle.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  Add Step
                </button>
                <button
                  onClick={() => {
                    setShowAddStep(false);
                    setNewStepTitle('');
                    setNewStepDesc('');
                    setNewStepUrl('');
                  }}
                  className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </m.div>
      )}
    </div>
  );
}
