'use client';

import { useState } from 'react';
import { m } from 'framer-motion';
import { INPUT_CLASSES } from '@/lib/process-constants';

interface FunctionFormProps {
  mode: 'create' | 'edit';
  initialName?: string;
  initialDesc?: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
}

export function FunctionForm({
  mode,
  initialName = '',
  initialDesc = '',
  onSubmit,
  onCancel,
}: FunctionFormProps) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit(name.trim(), desc.trim());
  };

  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mb-6 glass-panel p-4">
        <h3 className="text-sm font-display font-semibold text-[var(--text-primary)] mb-3">
          {mode === 'create' ? 'New Business Function' : 'Edit Function'}
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Function name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onCancel();
            }}
            className={`w-full ${INPUT_CLASSES}`}
          />
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            className={`w-full ${INPUT_CLASSES}`}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
            <button
              onClick={onCancel}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </m.div>
  );
}
