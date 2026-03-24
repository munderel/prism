'use client';

import React, { useState, useRef, useEffect } from 'react';
import { m } from 'framer-motion';
import { Pencil, Trash2, Check } from 'lucide-react';
import { KpiProgressBar } from './KpiProgressBar';

interface KpiCardProps {
  kpi: any;
  onUpdate: (id: string, data: any) => Promise<void>;
  onEdit: (kpi: any) => void;
  onDelete: (id: string) => void;
}

export const KpiCard = React.memo(function KpiCard({
  kpi,
  onUpdate,
  onEdit,
  onDelete,
}: KpiCardProps) {
  const [editingActual, setEditingActual] = useState(false);
  const [actualValue, setActualValue] = useState(String(kpi.actual ?? 0));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingActual && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingActual]);

  const handleSaveActual = async () => {
    const parsed = parseFloat(actualValue);
    if (!isNaN(parsed) && parsed !== kpi.actual) {
      await onUpdate(kpi.id, { actual: parsed });
    }
    setEditingActual(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveActual();
    if (e.key === 'Escape') {
      setActualValue(String(kpi.actual ?? 0));
      setEditingActual(false);
    }
  };

  const pct = kpi.target > 0 ? Math.round((kpi.actual / kpi.target) * 100) : 0;

  if (kpi.type === 'BINARY') {
    return (
      <m.div
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="group rounded-lg border border-white/[0.06] bg-white/[0.04] p-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-white font-medium truncate">{kpi.name}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(kpi)}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-white"
              title="Edit KPI"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(kpi.id)}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-red-400"
              title="Delete KPI"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          {kpi.completedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/20">
              <Check className="h-3 w-3" />
              Complete
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-500/15 px-2 py-0.5 text-xs font-medium text-gray-400 border border-gray-500/20">
              Not Complete
            </span>
          )}
          <button
            onClick={() =>
              onUpdate(kpi.id, {
                completedAt: kpi.completedAt ? null : new Date().toISOString(),
              })
            }
            className="rounded px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            {kpi.completedAt ? 'Mark Incomplete' : 'Mark Complete'}
          </button>
        </div>

        {kpi.completedAt && (
          <p className="mt-1 text-xs text-gray-500">
            Completed {new Date(kpi.completedAt).toLocaleDateString()}
          </p>
        )}
      </m.div>
    );
  }

  // NUMERIC variant
  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group rounded-lg border border-white/[0.06] bg-white/[0.04] p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white font-medium truncate">{kpi.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{pct}%</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(kpi)}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-white"
              title="Edit KPI"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(kpi.id)}
              className="rounded p-1 text-gray-500 hover:bg-white/[0.05] hover:text-red-400"
              title="Delete KPI"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {editingActual ? (
        <div className="flex items-center gap-2 mb-2">
          <input
            ref={inputRef}
            type="number"
            value={actualValue}
            onChange={(e) => setActualValue(e.target.value)}
            onBlur={handleSaveActual}
            onKeyDown={handleKeyDown}
            className="w-24 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-white text-sm focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">/ {kpi.target}{kpi.unit ? ` ${kpi.unit}` : ''}</span>
        </div>
      ) : (
        <div
          onClick={() => setEditingActual(true)}
          className="cursor-pointer"
          title="Click to edit actual value"
        >
          <KpiProgressBar actual={kpi.actual ?? 0} target={kpi.target ?? 0} unit={kpi.unit} />
        </div>
      )}

      {kpi.linkedWeeklyActuals && kpi.linkedWeeklyActuals.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {kpi.linkedWeeklyActuals.map((week: any, i: number) => (
            <div
              key={week.id ?? i}
              className="rounded bg-white/[0.03] px-1.5 py-1 text-center"
            >
              <span className="text-[10px] text-gray-500 block">W{i + 1}</span>
              <span className="text-xs text-gray-300">
                {kpi.unit === '$' ? '$' : ''}{week.actual ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </m.div>
  );
});
