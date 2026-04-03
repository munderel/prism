'use client';

import { DURATION_OPTIONS, formatDurationLabel } from '@/lib/process-constants';

interface DurationPickerProps {
  selected: number;
  onChange: (mins: number) => void;
}

export function DurationPicker({ selected, onChange }: DurationPickerProps) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-1">Default Duration</label>
      <div className="flex flex-wrap gap-1.5">
        {DURATION_OPTIONS.map((mins) => (
          <button
            key={mins}
            type="button"
            onClick={() => onChange(mins)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              selected === mins
                ? 'bg-indigo-600 text-white border border-indigo-600'
                : 'text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--glass-border)]'
            }`}
          >
            {formatDurationLabel(mins)}
          </button>
        ))}
      </div>
    </div>
  );
}
