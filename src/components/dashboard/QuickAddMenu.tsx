'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight } from 'lucide-react';
import { useSWRConfig } from 'swr';
import { PRISM_COLORS } from '@/lib/prism-colors';
import { InlineTaskCreator } from '@/components/tasks/InlineTaskCreator';

interface QuickAddMenuProps {
  className?: string;
}

type MenuItem = {
  emoji: string;
  label: string;
  desc: string;
  color: { color: string };
} & ({ kind: 'nav'; path: string } | { kind: 'inline'; action: 'idea' });

const MENU_ITEMS: MenuItem[] = [
  { kind: 'nav', emoji: '\uD83E\uDDED', label: 'Goal', desc: 'Add to a goal stack', path: '/goals', color: PRISM_COLORS.IMPROVE },
  { kind: 'nav', emoji: '\uD83C\uDFAF', label: 'Improve Task', desc: 'Move goals forward', path: '/improve/new', color: PRISM_COLORS.IMPROVE },
  { kind: 'nav', emoji: '\u26A1', label: 'React Task', desc: 'Respond to incoming requests', path: '/reactive-tasks/new', color: PRISM_COLORS.REACT },
  { kind: 'nav', emoji: '\uD83D\uDD27', label: 'Maintenance', desc: 'Keep things running', path: '/maintenance/new', color: PRISM_COLORS.MAINTENANCE },
  { kind: 'nav', emoji: '\uD83D\uDCCB', label: 'Review', desc: 'Plan & reflect', path: '/reviews', color: PRISM_COLORS.REVIEW },
  { kind: 'inline', emoji: '\uD83D\uDCA1', label: 'Idea', desc: 'Capture for later', action: 'idea', color: PRISM_COLORS.POWER_DOWN },
];

export function QuickAddMenu({ className }: QuickAddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ideaMode, setIdeaMode] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaSaving, setIdeaSaving] = useState(false);
  const [ideaError, setIdeaError] = useState('');
  const ideaInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (ideaMode) ideaInputRef.current?.focus();
  }, [ideaMode]);

  function resetAll() {
    setIsOpen(false);
    setIdeaMode(false);
    setIdeaTitle('');
    setIdeaError('');
  }

  async function submitIdea() {
    if (!ideaTitle.trim()) return;
    setIdeaSaving(true);
    setIdeaError('');
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ideaTitle.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      mutate((key: string) => typeof key === 'string' && key.startsWith('/api/ideas'));
      resetAll();
    } catch {
      setIdeaError('Failed to save idea. Try again.');
    } finally {
      setIdeaSaving(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        resetAll();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  function handleNavigate(path: string) {
    resetAll();
    router.push(path);
  }

  return (
    <div ref={menuRef} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm border border-[var(--border-color)] hover:bg-[var(--hover-bg)] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Quick Add
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-[var(--surface)] shadow-lg border border-[var(--border-color)] py-2 z-50"
        >
          <div className="px-3 py-2 border-b border-[var(--border-color)]">
            <InlineTaskCreator
              placeholder="Quick task..."
              onCreated={() => {
                mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tasks'));
              }}
            />
          </div>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.kind === 'nav' ? item.path : item.action}
              onClick={() => {
                if (item.kind === 'nav') handleNavigate(item.path);
                else setIdeaMode(true);
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
              style={{ borderLeft: `3px solid ${item.color.color}` }}
            >
              <span className="text-base">{item.emoji}</span>
              <div className="flex-1 text-left">
                <span className="font-medium">{item.label}</span>
                <span className="block text-xs text-[var(--text-muted)]">{item.desc}</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            </button>
          ))}
          {ideaMode && (
            <div className="border-t border-[var(--border-color)] px-3 py-3">
              <p className="text-xs text-amber-400 font-medium mb-2">Quick Idea Capture</p>
              <form
                onSubmit={(e) => { e.preventDefault(); void submitIdea(); }}
                className="flex gap-2"
              >
                <input
                  ref={ideaInputRef}
                  type="text"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="What's on your mind?"
                  className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={ideaSaving || !ideaTitle.trim()}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm text-white hover:bg-amber-400 disabled:opacity-50"
                >
                  Save
                </button>
              </form>
              {ideaError && <p className="text-[10px] text-red-400 mt-1">{ideaError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
