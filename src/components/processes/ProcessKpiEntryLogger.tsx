'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getLocalDateString } from '@/lib/date-utils';

interface ProcessKpiEntryLoggerProps {
  processId: string;
  kpiId: string;
  unit?: string | null;
  onLogged?: () => void;
}

export function ProcessKpiEntryLogger({
  processId,
  kpiId,
  unit,
  onLogged,
}: ProcessKpiEntryLoggerProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(getLocalDateString());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/processes/${processId}/kpis/${kpiId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: parsed,
          date: date || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to log entry');
      }
      toast.success('Entry logged');
      setValue('');
      setNotes('');
      setDate(getLocalDateString());
      onLogged?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2 flex-wrap">
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={unit ? `Value (${unit})` : 'Value'}
        required
        step="any"
        className="w-28 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="flex-1 min-w-[120px] rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-1.5 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={saving || !value}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {saving ? 'Logging…' : 'Log'}
      </button>
    </form>
  );
}
