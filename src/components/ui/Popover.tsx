'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Side = 'right' | 'bottom';

interface PopoverProps {
  open: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  preferredSide?: Side;
  offset?: number;
  className?: string;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 8;

interface ComputedLayout {
  top: number;
  left: number;
  maxHeight: number;
}

export function Popover({
  open,
  anchorRect,
  onClose,
  preferredSide = 'right',
  offset = 8,
  className = '',
  children,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ComputedLayout | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setLayout(null);
      return;
    }
    const el = popoverRef.current;
    if (!el) return;

    const compute = () => {
      const node = popoverRef.current;
      if (!node) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cap = vh - VIEWPORT_MARGIN * 2;

      const rect = node.getBoundingClientRect();
      const w = rect.width;
      const h = Math.min(rect.height, cap);

      let top: number;
      let left: number;

      if (preferredSide === 'right') {
        left = anchorRect.right + offset;
        if (left + w > vw - VIEWPORT_MARGIN) {
          left = anchorRect.left - w - offset;
        }
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - w - VIEWPORT_MARGIN));

        top = anchorRect.top;
        if (top + h > vh - VIEWPORT_MARGIN) {
          top = anchorRect.bottom - h;
        }
        top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - h - VIEWPORT_MARGIN));
      } else {
        top = anchorRect.bottom + offset;
        if (top + h > vh - VIEWPORT_MARGIN) {
          top = anchorRect.top - h - offset;
        }
        top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - h - VIEWPORT_MARGIN));

        left = anchorRect.left + anchorRect.width / 2 - w / 2;
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - w - VIEWPORT_MARGIN));
      }

      setLayout({ top, left, maxHeight: cap });
    };

    compute();

    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [open, anchorRect, preferredSide, offset]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      className={`fixed z-[60] flex flex-col rounded-xl border border-[var(--border-color)] bg-[var(--background)] shadow-2xl backdrop-blur-sm ${className}`}
      style={{
        top: layout?.top ?? 0,
        left: layout?.left ?? 0,
        maxHeight: layout?.maxHeight,
        visibility: layout ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
}

export function PopoverHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] flex-shrink-0">
      {children}
    </div>
  );
}

export function PopoverBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
      {children}
    </div>
  );
}

export function PopoverFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-[var(--border-color)] flex flex-col gap-2 flex-shrink-0">
      {children}
    </div>
  );
}

export function PopoverClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors flex-shrink-0"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
