'use client';

interface NotesCompletionStepProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

export function NotesCompletionStep({
  value,
  onChange,
  placeholder = 'What stood out? What will you do differently?',
  rows = 6,
}: NotesCompletionStepProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm text-[var(--text-secondary)] mb-1">
        Reflections, insights, action items...
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
        placeholder={placeholder}
      />
    </div>
  );
}
