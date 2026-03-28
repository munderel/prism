'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface StepNotesCompletionProps {
  reviewId: string;
  initialNotes?: string;
  onNotesChange: (notes: string) => void;
}

export function StepNotesCompletion({ reviewId, initialNotes, onNotesChange }: StepNotesCompletionProps) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (initialNotes !== undefined && initialNotes !== notes) {
      setNotes(initialNotes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotes]);

  const handleChange = (value: string) => {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onNotesChange(value);
    }, 600);
  };

  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onNotesChange(notes);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <FileText className="h-4 w-4 text-indigo-400" />
        <p className="text-sm">
          Add any final reflections, insights, or action items. Then complete your review.
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={6}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
        placeholder="What stood out this week? What will you do differently next week? Any ideas or insights?"
      />
    </div>
  );
}
