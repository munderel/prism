'use client';

import { useState } from 'react';
import { X, Check, HelpCircle, XCircle, Loader2 } from 'lucide-react';

export interface GroupableAimItem {
  id: string;
  scheduledDate: string;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  aimCategory: {
    id: string;
    name: string;
    isDaily: boolean;
  };
  owner: {
    id: string;
    name: string | null;
    image: string | null;
  };
  attendStatus: 'NONE' | 'GOING' | 'MAYBE' | 'NOT_GOING';
}

interface AttendAimModalProps {
  item: GroupableAimItem;
  onClose: () => void;
  onAttend: (status: 'GOING' | 'MAYBE' | 'NOT_GOING') => Promise<void>;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AttendAimModal({ item, onClose, onAttend }: AttendAimModalProps) {
  const [loading, setLoading] = useState<'GOING' | 'MAYBE' | 'NOT_GOING' | null>(null);

  const handleAction = async (status: 'GOING' | 'MAYBE' | 'NOT_GOING') => {
    setLoading(status);
    try {
      await onAttend(status);
    } finally {
      setLoading(null);
    }
  };

  const timeDisplay = item.timeBlockStart
    ? `${formatTime(item.timeBlockStart)}${item.timeBlockEnd ? ` – ${formatTime(item.timeBlockEnd)}` : ''}`
    : formatTime(item.scheduledDate);

  const ownerName = item.owner.name ?? 'A teammate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-2">
            {item.aimCategory.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Owner info */}
        <div className="flex items-center gap-3 mb-4">
          {item.owner.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.owner.image}
              alt={ownerName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-teal-400 text-xs font-semibold">
              {ownerName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{ownerName}</div>
            {timeDisplay && (
              <div className="text-xs text-[var(--text-muted)]">{timeDisplay}</div>
            )}
          </div>
        </div>

        {/* Info text */}
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          {ownerName} has scheduled this groupable AIM. Attending creates your own
          instance and counts toward your streak independently.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleAction('GOING')}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading === 'GOING' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Attend — add to my schedule
          </button>

          <button
            onClick={() => handleAction('MAYBE')}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
          >
            {loading === 'MAYBE' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HelpCircle className="h-4 w-4" />
            )}
            Maybe
          </button>

          <button
            onClick={() => handleAction('NOT_GOING')}
            disabled={!!loading}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50 transition-colors"
          >
            {loading === 'NOT_GOING' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Not interested
          </button>
        </div>

        {/* Custom AIM note */}
        {!item.aimCategory.isDaily && (
          <p className="mt-4 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)] pt-3">
            This AIM category will be added to your schedule. If you prefer to link
            it to a different AIM in your library, visit the AIMs page after attending.
          </p>
        )}
      </div>
    </div>
  );
}
