'use client';

import { useState, useRef, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, Check, FileText, ChevronDown } from 'lucide-react';

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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [yamlContent, setYamlContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [exampleMenuOpen, setExampleMenuOpen] = useState(false);
  const exampleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exampleMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exampleMenuRef.current && !exampleMenuRef.current.contains(e.target as Node)) {
        setExampleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exampleMenuOpen]);

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

  const downloadFile = async (path: string, filename: string) => {
    const res = await fetch(path);
    if (!res.ok) return;
    const yaml = await res.text();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExampleMenuOpen(false);
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
      setWarnings(data.warnings ?? []);
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
      const data = await res.json();
      setWarnings(data.warnings ?? []);
      // Only auto-dismiss the diff if there are no warnings worth showing.
      if (!data.warnings?.length) {
        setDiff(null);
        setYamlContent('');
      }
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

        <div className="relative" ref={exampleMenuRef}>
          <button
            onClick={() => setExampleMenuOpen((o) => !o)}
            title="Download an example YAML"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--glass-border)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FileText className="h-4 w-4" />
            Example
            <ChevronDown className="h-3 w-3" />
          </button>
          {exampleMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg py-1">
              <button
                onClick={() => downloadFile('/example-goal-stack-full.yaml', 'example-goal-stack-full.yaml')}
                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
              >
                <div className="font-medium">Full goal stack</div>
                <div className="text-xs text-[var(--text-muted)]">All fields, KPIs, links</div>
              </button>
              <button
                onClick={() => downloadFile('/example-task-types.yaml', 'example-task-types.yaml')}
                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
              >
                <div className="font-medium">Task types + weekly dates</div>
                <div className="text-xs text-[var(--text-muted)]">IMPROVE, REACT, MAINTENANCE, REVIEW</div>
              </button>
            </div>
          )}
        </div>

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

            {(diff.meta?.linksAdded?.length > 0 || diff.meta?.linksRemoved?.length > 0) && (
              <div className="mb-2">
                <span className="text-xs font-medium text-cyan-400">Goal link changes</span>
                {diff.meta.linksAdded.map((l: any, i: number) => (
                  <div key={`la${i}`} className="text-xs text-green-300/70 ml-4">
                    + {l.companyGoal} → {l.user}: {l.goal}
                  </div>
                ))}
                {diff.meta.linksRemoved.map((l: any, i: number) => (
                  <div key={`lr${i}`} className="text-xs text-red-300/70 ml-4">
                    - {l.companyGoal} → {l.user}: {l.goal}
                  </div>
                ))}
              </div>
            )}

            {(diff.meta?.companyAssignmentsAdded?.length > 0 ||
              diff.meta?.companyAssignmentsRemoved?.length > 0 ||
              diff.meta?.companyAssignmentsModified?.length > 0) && (
              <div className="mb-2">
                <span className="text-xs font-medium text-cyan-400">Company assignment changes</span>
                {diff.meta.companyAssignmentsAdded.map((a: any, i: number) => (
                  <div key={`caa${i}`} className="text-xs text-green-300/70 ml-4">
                    + {a.user}{a.notes ? ` (${a.notes})` : ''}
                  </div>
                ))}
                {diff.meta.companyAssignmentsRemoved.map((a: any, i: number) => (
                  <div key={`car${i}`} className="text-xs text-red-300/70 ml-4">
                    - {a.user}
                  </div>
                ))}
                {diff.meta.companyAssignmentsModified.map((a: any, i: number) => (
                  <div key={`cam${i}`} className="text-xs text-yellow-300/70 ml-4">
                    ~ {a.user}: {Object.keys(a.changes).join(', ')}
                  </div>
                ))}
              </div>
            )}

            {(diff.meta?.visibility || diff.meta?.weekStartDay) && (
              <div className="mb-2">
                <span className="text-xs font-medium text-yellow-400">Stack metadata</span>
                {diff.meta.visibility && (
                  <div className="text-xs text-yellow-300/70 ml-4">
                    visibility: {String(diff.meta.visibility.from)} → {String(diff.meta.visibility.to)}
                  </div>
                )}
                {diff.meta.weekStartDay && (
                  <div className="text-xs text-yellow-300/70 ml-4">
                    week_start_day: {String(diff.meta.weekStartDay.from)} → {String(diff.meta.weekStartDay.to)}
                  </div>
                )}
              </div>
            )}

            {diff.added.length === 0 && diff.deleted.length === 0 &&
              diff.modified.length === 0 && !diff.kpiChanges?.length && !diff.taskChanges?.length &&
              !diff.meta?.linksAdded?.length && !diff.meta?.linksRemoved?.length &&
              !diff.meta?.companyAssignmentsAdded?.length && !diff.meta?.companyAssignmentsRemoved?.length &&
              !diff.meta?.companyAssignmentsModified?.length &&
              !diff.meta?.visibility && !diff.meta?.weekStartDay && (
                <p className="text-xs text-[var(--text-muted)]">No changes detected.</p>
              )}

            {warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2">
                <div className="text-xs font-medium text-yellow-400 mb-1">
                  {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                </div>
                {warnings.map((w, i) => (
                  <div key={i} className="text-xs text-yellow-300/70 ml-2">• {w}</div>
                ))}
              </div>
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
                  setWarnings([]);
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
