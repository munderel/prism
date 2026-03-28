'use client';

interface DifficultiesStepProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

export function DifficultiesStep({
  value,
  onChange,
  placeholder = 'What difficulties did you experience? (friction, blockers, challenges...)',
  rows = 6,
}: DifficultiesStepProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
      placeholder={placeholder}
    />
  );
}
