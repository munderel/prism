'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

interface InlineTaskCreatorProps {
  /** Default due date (YYYY-MM-DD) for the created task */
  defaultDate?: string;
  /** Callback after task is created */
  onCreated?: (task: any) => void;
  /** Placeholder text */
  placeholder?: string;
}

export function InlineTaskCreator({ defaultDate, onCreated, placeholder = 'Add a quick task...' }: InlineTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          taskType: 'CHORE',
          priority: 'MEDIUM',
          ...(defaultDate ? { dueDate: defaultDate } : {}),
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTitle('');
        onCreated?.(task);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [title, defaultDate, onCreated, isSubmitting]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setTitle('');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors py-1"
      >
        <Plus className="h-3.5 w-3.5" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (!title.trim()) setIsOpen(false); }}
        placeholder={placeholder}
        disabled={isSubmitting}
        className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-indigo-500 focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || isSubmitting}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        Add
      </button>
    </div>
  );
}
