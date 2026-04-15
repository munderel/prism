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

const MENU_ITEMS = [
  { emoji: '\uD83C\uDFAF', label: 'Improve Task', desc: 'Move goals forward', path: '/goals', color: PRISM_COLORS.IMPROVE },
  { emoji: '\u26A1', label: 'React Task', desc: 'Respond to incoming requests', path: '/reactive-tasks/new', color: PRISM_COLORS.REACT },
  { emoji: '\uD83D\uDD27', label: 'Maintenance', desc: 'Keep things running', path: '/processes', color: PRISM_COLORS.MAINTENANCE },
  { emoji: '\uD83D\uDCCB', label: 'Review', desc: 'Plan & reflect', path: '/reviews', color: PRISM_COLORS.REVIEW },
  { emoji: '\uD83D\uDCA1', label: 'Idea', desc: 'Capture for later', path: '/ideas', color: PRISM_COLORS.POWER_DOWN },
];

export function QuickAddMenu({ className }: QuickAddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { mutate } = useSWRConfig();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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
    setIsOpen(false);
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
              placeholder="Quick chore..."
              onCreated={() => {
                mutate((key: string) => typeof key === 'string' && key.startsWith('/api/tasks'));
              }}
            />
          </div>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
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
        </div>
      )}
    </div>
  );
}
