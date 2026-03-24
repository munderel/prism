'use client';

import { useState, useRef } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, Check } from 'lucide-react';

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
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors"
        >
          <Download className="h-4 w-4" />
          Export YAML
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-600 hover:text-white transition-colors"
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
            className="mt-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4"
          >
            <h3 className="text-sm font-semibold text-white mb-3">Import Preview</h3>

            {diff.added.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-green-400">
                  + {diff.added.length} new goal{diff.added.length !== 1 ? 's' : ''}
                </span>
                {diff.added.map((g: any, i: number) => (
                  <div key={i} className="text-xs text-green-300/70 ml-4">
                    {g.title}
                  </div>
                ))}
              </div>
            )}

            {diff.deleted.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-red-400">
                  - {diff.deleted.length} removed goal{diff.deleted.length !== 1 ? 's' : ''}
                </span>
                {diff.deleted.map((g: any, i: number) => (
                  <div key={i} className="text-xs text-red-300/70 ml-4">
                    {g.title}
                  </div>
                ))}
              </div>
            )}

            {diff.modified.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-medium text-yellow-400">
                  ~ {diff.modified.length} modified goal{diff.modified.length !== 1 ? 's' : ''}
                </span>
                {diff.modified.map((g: any, i: number) => (
                  <div key={i} className="text-xs text-yellow-300/70 ml-4">
                    {g.title}: {Object.keys(g.changes).join(', ')}
                  </div>
                ))}
              </div>
            )}

            {diff.added.length === 0 &&
              diff.deleted.length === 0 &&
              diff.modified.length === 0 && (
                <p className="text-xs text-gray-500">No changes detected.</p>
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
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-white"
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
