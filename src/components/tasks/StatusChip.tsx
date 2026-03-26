'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface StatusChipProps {
  status: string;
  onStatusChange: (newStatus: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  TODO: 'border border-gray-600 text-gray-400 hover:border-gray-500',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  DONE: 'bg-green-500/20 text-green-400 border border-green-500/30',
  DROPPED: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN PROGRESS',
  DONE: 'DONE',
  DROPPED: 'DROPPED',
};

const CYCLE_ORDER = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const ALL_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'DROPPED'] as const;

export const StatusChip = React.memo(function StatusChip({ status, onStatusChange }: StatusChipProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  useClickOutside(menuRef, useCallback(() => setMenuOpen(false), []), menuOpen);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const currentIndex = CYCLE_ORDER.indexOf(status as typeof CYCLE_ORDER[number]);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % CYCLE_ORDER.length;
    onStatusChange(CYCLE_ORDER[nextIndex]);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen((prev) => !prev);
  };

  const handleMenuSelect = (newStatus: string) => {
    setMenuOpen(false);
    if (newStatus !== status) {
      onStatusChange(newStatus);
    }
  };

  const styleClass = STATUS_STYLES[status] ?? STATUS_STYLES.TODO;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className="relative inline-block" ref={chipRef}>
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors select-none ${styleClass}`}
        title="Click to cycle status; right-click for all options"
      >
        {status === 'DONE' && (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
        {label}
      </span>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute z-50 mt-1 left-0 min-w-[120px] rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg py-1"
        >
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={(e) => {
                e.stopPropagation();
                handleMenuSelect(s);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${
                s === status ? 'font-bold' : ''
              } ${STATUS_STYLES[s].replace(/border\s/g, '').replace('border-gray-600', '').replace('hover:border-gray-500', '')}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
});
