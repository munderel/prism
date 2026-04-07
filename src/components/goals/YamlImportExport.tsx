'use client';

import { useState, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, Check, FileText } from 'lucide-react';

interface DiffSectionProps {
  items: any[];
  prefix: string;
  label: string;
  colorClass: string;
  textColorClass: string;
}

function DiffSection({ items, prefix, label, colorClass, textColorClass }: DiffSectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <span className={`text-xs font-medium ${colorClass}`}>
        {prefix} {items.length} {label}{items.length !== 1 ? 's' : ''}
      </span>
      {items.map((g: any, i: number) => (
        <div key={i} className={`text-xs ${textColorClass} ml-4`}>
          {g.title}{g.changes ? `: ${Object.keys(g.changes).join(', ')}` : ''}
        </div>
      ))}
    </div>
  );
}

interface YamlImportExportProps {
  stackId: string;
  stackName: string;
  onImportComplete: () => void;
}

export function YamlImportExport({
  stackId,
  stackName,
  onImportComplete,
}: YamlImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [diff, setDiff] = useState<any>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    const res = await fetch(`/api/stacks/${stackId}/export`);
    if (!res.ok) return;
    const yaml = await res.text();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stackName}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExample = async () => {
    const res = await fetch('/example-goal-stack-full.yaml');
    if (!res.ok) return;
    const yaml = await res.text();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'example-goal-stack-full.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    setYamlContent(content);

    // Preview mode
    const res = await fetch('/api/goals/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackId, yamlContent: content, confirmed: false }),
    });

    if (res.ok) {
      const data = await res.json();
      setDiff(data.diff);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    const res = await fetch('/api/goals/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stackId, yamlContent, confirmed: true }),
    });

    if (res.ok) {
      setDiff(null);
      setYamlContent('');
      onImportComplete();
    }
    setImporting(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--glass-border)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Download className="h-4 w-4" />
          Export YAML
        </button>

        <button
          onClick={handleDownloadExample}
          title="Download an example YAML with every field documented"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--glass-border)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FileText className="h-4 w-4" />
          Example
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--glass-border)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Upload className="h-4 w-4" />
          Import YAML
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <AnimatePresence>
        {diff && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 glass-panel p-4"
          >
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Import Preview</h3>

            <DiffSection items={diff.added} prefix="+" label="new goal" colorClass="text-green-400" textColorClass="text-green-300/70" />
            <DiffSection items={diff.deleted} prefix="-" label="removed goal" colorClass="text-red-400" textColorClass="text-red-300/70" />
            <DiffSection items={diff.modified} prefix="~" label="modified goal" colorClass="text-yellow-400" textColorClass="text-yellow-300/70" />

            {diff.kpiChanges?.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-indigo-400">
                  KPI changes in {diff.kpiChanges.length} goal{diff.kpiChanges.length !== 1 ? 's' : ''}
                </span>
                {diff.kpiChanges.map((entry: any, i: number) => (
                  <div key={i} className="ml-4 mt-1">
                    <span className="text-xs text-[var(--text-secondary)]">{entry.goalTitle}:</span>
                    {entry.added.map((k: any, j: number) => (
                      <div key={`a${j}`} className="text-xs text-green-300/70 ml-2">
                        + KPI: {k.name} ({k.type})
                      </div>
                    ))}
                    {entry.removed.map((k: any, j: number) => (
                      <div key={`r${j}`} className="text-xs text-red-300/70 ml-2">
                        - KPI: {k.name} ({k.type})
                      </div>
                    ))}
                    {entry.modified.map((k: any, j: number) => (
                      <div key={`m${j}`} className="text-xs text-yellow-300/70 ml-2">
                        ~ KPI: {k.name}: {Object.keys(k.changes).join(', ')}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {diff.taskChanges?.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-cyan-400">
                  Task changes in {diff.taskChanges.length} goal{diff.taskChanges.length !== 1 ? 's' : ''}
                </span>
                {diff.taskChanges.map((entry: any, i: number) => (
                  <div key={i} className="ml-4 mt-1">
                    <span className="text-xs text-[var(--text-secondary)]">{entry.goalTitle}:</span>
                    {entry.added.map((t: any, j: number) => (
                      <div key={`a${j}`} className="text-xs text-green-300/70 ml-2">
                        + Task: {t.title}
                      </div>
                    ))}
                    {entry.removed.map((t: any, j: number) => (
                      <div key={`r${j}`} className="text-xs text-red-300/70 ml-2">
                        - Task: {t.title}
                      </div>
                    ))}
                    {entry.modified.map((t: any, j: number) => (
                      <div key={`m${j}`} className="text-xs text-yellow-300/70 ml-2">
                        ~ Task: {t.title}: {Object.keys(t.changes).join(', ')}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {diff.added.length === 0 && diff.deleted.length === 0 &&
              diff.modified.length === 0 && !diff.kpiChanges?.length && !diff.taskChanges?.length && (
                <p className="text-xs text-[var(--text-muted)]">No changes detected.</p>
              )}

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {importing ? 'Importing...' : 'Confirm Import'}
              </button>
              <button
                onClick={() => {
                  setDiff(null);
                  setYamlContent('');
                }}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
