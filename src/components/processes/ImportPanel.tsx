'use client';

import { useState } from 'react';
import { m } from 'framer-motion';
import { X } from 'lucide-react';

interface ImportPanelProps {
  onImport: (json: string) => Promise<string | null>;
  onClose: () => void;
}

export function ImportPanel({ onImport, onClose }: ImportPanelProps) {
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');

  const handleImport = async () => {
    setImportError('');
    const error = await onImport(importJson);
    if (error) {
      setImportError(error);
    } else {
      setImportJson('');
      onClose();
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mb-6 glass-panel p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-display font-semibold text-[var(--text-primary)]">
            Import from JSON
          </h3>
          <button
            onClick={() => {
              onClose();
              setImportError('');
            }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder='{"functions": [{"name": "Marketing", "processes": [...]}]}'
          rows={8}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none font-mono"
        />
        {importError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{importError}</p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleImport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => {
              onClose();
              setImportJson('');
              setImportError('');
            }}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </m.div>
  );
}
