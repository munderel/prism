'use client';

import { useState } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';
import { X, Check, HelpCircle, XCircle, Loader2, Link2, Sparkles, ChevronLeft } from 'lucide-react';

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
  /**
   * Optional. When the modal is opened via an AIM invitation context
   * (e.g. from a notification), the invitation's id is passed through so the
   * "Link to similar AIM" / "Add as one-off" actions know which invitation
   * to operate on.
   */
  invitationId?: string;
}

interface SimilarAimResult {
  id: string;
  aimCategoryId: string;
  name: string;
  isDaily: boolean;
  currentPhase: string;
  currentStreak: number;
  distance: number;
}

interface SimilarAimsResponse {
  target: { id: string; name: string };
  results: SimilarAimResult[];
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

type LinkLoadingState = 'idle' | 'one-off' | 'linking';

export function AttendAimModal({ item, onClose, onAttend }: AttendAimModalProps) {
  const [loading, setLoading] = useState<'GOING' | 'MAYBE' | 'NOT_GOING' | null>(null);
  const [view, setView] = useState<'main' | 'similar'>('main');
  const [linkLoading, setLinkLoading] = useState<LinkLoadingState>('idle');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Only fetch similar AIMs while on the picker sub-view, to avoid an unneeded
  // request when the user never clicks "Link to similar".
  const similarKey =
    view === 'similar'
      ? `/api/aims/similar?aimCategoryId=${encodeURIComponent(item.aimCategory.id)}`
      : null;
  const { data: similarData, isLoading: similarLoading } =
    useSWR<SimilarAimsResponse>(similarKey);

  const handleAction = async (status: 'GOING' | 'MAYBE' | 'NOT_GOING') => {
    setLoading(status);
    try {
      await onAttend(status);
    } finally {
      setLoading(null);
    }
  };

  const handleOneOff = async () => {
    if (!item.invitationId || linkLoading !== 'idle') return;
    setLinkLoading('one-off');
    try {
      const res = await fetch(
        `/api/aims/invitations/${encodeURIComponent(item.invitationId)}/one-off`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) throw new Error(`one-off failed: ${res.status}`);
      // Revalidate the relevant SWR caches so the UI reflects the new state.
      await Promise.all([
        swrMutate('/api/calendar/groupable-aims'),
        swrMutate('/api/aims'),
      ]);
      onClose();
    } catch (err) {
      console.error('[AttendAimModal] one-off failed:', err);
      setLinkLoading('idle');
    }
  };

  const handleLink = async (userAimId: string) => {
    if (!item.invitationId || linkLoading !== 'idle') return;
    setLinkLoading('linking');
    setLinkingId(userAimId);
    try {
      const res = await fetch(
        `/api/aims/invitations/${encodeURIComponent(item.invitationId)}/link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAimId }),
        },
      );
      if (!res.ok) throw new Error(`link failed: ${res.status}`);
      await Promise.all([
        swrMutate('/api/calendar/groupable-aims'),
        swrMutate('/api/aims'),
      ]);
      onClose();
    } catch (err) {
      console.error('[AttendAimModal] link failed:', err);
      setLinkLoading('idle');
      setLinkingId(null);
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
        {view === 'main' ? (
          <>
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
                disabled={!!loading || linkLoading !== 'idle'}
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
                disabled={!!loading || linkLoading !== 'idle'}
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
                disabled={!!loading || linkLoading !== 'idle'}
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

            {/* Custom AIM branch: link-to-similar / one-off actions */}
            {!item.aimCategory.isDaily && (
              <div className="mt-4 border-t border-[var(--border-color)] pt-4">
                {item.invitationId ? (
                  <>
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      This isn&apos;t in your library. Choose how to log it:
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setView('similar')}
                        disabled={!!loading || linkLoading !== 'idle'}
                        className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                      >
                        <Link2 className="h-4 w-4" />
                        Link to similar AIM
                      </button>
                      <button
                        onClick={handleOneOff}
                        disabled={!!loading || linkLoading !== 'idle'}
                        className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                      >
                        {linkLoading === 'one-off' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Add as one-off
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    This AIM category will be added to your schedule. If you prefer to link
                    it to a different AIM in your library, visit the AIMs page after attending.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Similar-AIM picker sub-view */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  if (linkLoading === 'idle') setView('main');
                }}
                disabled={linkLoading !== 'idle'}
                className="flex items-center gap-1 rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
              >
                <ChevronLeft size={16} />
                <span className="text-sm">Back</span>
              </button>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Link to similar AIM
              </h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-4">
              Pick a UserAim to credit this attendance to. Counts toward that
              UserAim&apos;s streak.
            </p>

            {similarLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : !similarData || similarData.results.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                You don&apos;t have any UserAims yet. Use &ldquo;Add as one-off&rdquo;
                instead, or create an AIM first.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {similarData.results.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => handleLink(r.id)}
                      disabled={linkLoading !== 'idle'}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium truncate">{r.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {r.isDaily ? 'Daily' : 'Weekly'} · streak {r.currentStreak}
                        </span>
                      </span>
                      {linkLoading === 'linking' && linkingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                      ) : (
                        <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
