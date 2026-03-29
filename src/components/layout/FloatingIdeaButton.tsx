'use client';

import { useState, useEffect, useRef } from 'react';
import { Lightbulb, Send, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function FloatingIdeaButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  // Keyboard shortcut: Cmd+I
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Hide on ideas page (already has creation UI)
  const hidden = pathname === '/ideas' || pathname === '/ideas/new';

  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setTitle('');
      setOpen(false);
    } catch {
      setError('Failed to save idea. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (hidden) return null;

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-400 transition-colors flex items-center justify-center"
        title="Quick Idea (Cmd+I)"
        aria-label={open ? 'Close idea capture' : 'Capture a quick idea'}
      >
        {open ? <X className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
      </button>

      {/* Quick capture modal */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 rounded-xl bg-[var(--surface)] shadow-2xl border border-[var(--border-color)] p-4">
          <p className="text-xs text-amber-400 font-medium mb-2">Quick Idea Capture</p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's on your mind?"
              className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving || !title.trim()}
              aria-label="Save idea"
              className="rounded-lg bg-amber-500 px-3 py-2 text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Saved to Ideas. Press Cmd+I to toggle.</p>
        </div>
      )}
    </>
  );
}
