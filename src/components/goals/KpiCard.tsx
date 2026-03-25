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

export const KpiCard = React.memo(React.forwardRef<HTMLDivElement, KpiCardProps>(function KpiCard({
  kpi,
  onUpdate,
  onEdit,
  onDelete,
}: KpiCardProps, ref) {
  const [editingActual, setEditingActual] = useState(false);
  const [actualValue, setActualValue] = useState(String(kpi.actualValue ?? 0));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingActual && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingActual]);

  const handleSaveActual = async () => {
    const parsed = parseFloat(actualValue);
    if (!isNaN(parsed) && parsed !== kpi.actualValue) {
      await onUpdate(kpi.id, { actualValue: parsed });
    }
    setEditingActual(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveActual();
    if (e.key === 'Escape') {
      setActualValue(String(kpi.actualValue ?? 0));
      setEditingActual(false);
    }
  };

  const pct = kpi.targetValue > 0 ? Math.round((kpi.actualValue / kpi.targetValue) * 100) : 0;

  if (kpi.type === 'BINARY') {
    return (
      <m.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="group rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-primary)] font-medium truncate">{kpi.name}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(kpi)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              title="Edit KPI"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(kpi.id)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400"
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
            <span className="inline-flex items-center rounded-full bg-gray-500/15 px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] border border-gray-500/20">
              Not Complete
            </span>
          )}
          <button
            onClick={() =>
              onUpdate(kpi.id, {
                isComplete: !kpi.isComplete,
              })
            }
            className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            {kpi.completedAt ? 'Mark Incomplete' : 'Mark Complete'}
          </button>
        </div>

        {kpi.completedAt && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Completed {new Date(kpi.completedAt).toLocaleDateString()}
          </p>
        )}
      </m.div>
    );
  }

  // NUMERIC variant
  return (
    <m.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group rounded-lg border border-[var(--border-color)] bg-[var(--hover-bg)] p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--text-primary)] font-medium truncate">{kpi.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">{pct}%</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(kpi)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              title="Edit KPI"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(kpi.id)}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400"
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
            className="w-24 rounded border border-white/[0.08] bg-[var(--hover-bg)] px-2 py-1 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-xs text-[var(--text-muted)]">/ {kpi.targetValue}{kpi.unit ? ` ${kpi.unit}` : ''}</span>
        </div>
      ) : (
        <div
          onClick={() => setEditingActual(true)}
          className="cursor-pointer"
          title="Click to edit actual value"
        >
          <KpiProgressBar actual={kpi.actualValue ?? 0} target={kpi.targetValue ?? 0} unit={kpi.unit} />
        </div>
      )}

      {kpi.linkedWeeklyActuals && kpi.linkedWeeklyActuals.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {kpi.linkedWeeklyActuals.map((week: any, i: number) => (
            <div
              key={week.id ?? i}
              className="rounded bg-[var(--surface)] px-1.5 py-1 text-center"
            >
              <span className="text-[10px] text-[var(--text-muted)] block">W{i + 1}</span>
              <span className="text-xs text-[var(--text-secondary)]">
                {kpi.unit === '$' ? '$' : ''}{week.actual ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}
    </m.div>
  );
}));
