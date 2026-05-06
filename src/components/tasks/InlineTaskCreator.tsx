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

export function InlineTaskCreator({ defaultDate, onCreated, placeholder = 'Quick React — type a title and hit Enter' }: InlineTaskCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          // Quick React: fastest possible task creation — title only,
          // React type (responds to an incoming need), medium priority.
          taskType: 'REACT',
          priority: 'MEDIUM',
          ...(defaultDate ? { dueDate: defaultDate } : {}),
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTitle('');
        onCreated?.(task);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `Failed to create task (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
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
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!title.trim() && !error) setIsOpen(false); }}
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
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
