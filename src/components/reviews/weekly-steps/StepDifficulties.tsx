'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface StepDifficultiesProps {
  reviewId: string;
  initialText?: string;
  onAnswerChange: (text: string) => void;
}

export function StepDifficulties({ reviewId: _reviewId, initialText, onAnswerChange }: StepDifficultiesProps) {
  const [text, setText] = useState(initialText ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (initialText !== undefined && initialText !== text) {
      setText(initialText);
    }
    // only sync on mount / external change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const handleChange = (value: string) => {
    setText(value);
    // Debounce persistence
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onAnswerChange(value);
    }, 600);
  };

  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onAnswerChange(text);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <p className="text-sm">
          What difficulties did you experience? Think about friction, blockers, and challenges.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={6}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none resize-none"
        placeholder="Describe any difficulties, blockers, or friction you experienced this week..."
      />
    </div>
  );
}
