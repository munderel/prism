'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { ClipboardCheck, Plus, Check, X, Users, User, Download, PlayCircle } from 'lucide-react';
import { ReviewChecklist } from '@/components/reviews/ReviewChecklist';
import { getLocalDateString } from '@/lib/date-utils';
import { useRouter, useSearchParams } from 'next/navigation';

interface ReviewData {
  id: string;
  reviewType: string;
  scheduledDate: string;
  completedAt: string | null;
  isTeamReview: boolean;
  userId: string;
  timeBlockStart: string | null;
  timeBlockEnd: string | null;
  answers: unknown[];
}

interface TeamReviewConfig {
  id: string;
  reviewType: string;
  dayOfWeek: number | null;
  recurrenceRule: string | null;
  time: string;
  duration: number;
  isActive: boolean;
  members: { userId: string; user: { id: string; name: string | null; email: string } }[];
}

interface TeamUser {
  id: string;
  name: string | null;
  email: string;
}

const REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const MONTHLY_RECURRENCE_OPTIONS = [
  { value: 'last-friday', label: 'Last Friday' },
  { value: 'last-monday', label: 'Last Monday' },
  { value: '1st-monday', label: '1st Monday' },
  { value: '1st-friday', label: '1st Friday' },
  { value: '15th', label: '15th of month' },
] as const;

const YEARLY_RECURRENCE_OPTIONS = [
  { value: 'last-sat-dec', label: 'Last Saturday of December' },
  { value: 'dec-30', label: 'December 30' },
  { value: 'dec-31', label: 'December 31' },
] as const;

const typeColors: Record<string, string> = {
  WEEKLY: 'text-green-400 bg-green-600/20 border-green-600/30',
  MONTHLY: 'text-blue-400 bg-blue-600/20 border-blue-600/30',
  YEARLY: 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30',
};

type TabValue = 'history' | 'team';

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading reviews...</div>}>
      <ReviewsPageInner />
    </Suspense>
  );
}

function ReviewsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const { data: reviewsData, isLoading: loading, mutate: mutateReviews } = useSWR<ReviewData[]>('/api/reviews');
  const allReviews: ReviewData[] = Array.isArray(reviewsData) ? reviewsData : [];
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('team');

  // Team review management
  const { data: teamReviewConfigs, mutate: mutateTeamConfigs } = useSWR<TeamReviewConfig[]>('/api/team-reviews');
  const { data: allUsers } = useSWR<TeamUser[]>(isAdmin ? '/api/admin' : null);
  const [creatingTeamReview, setCreatingTeamReview] = useState(false);
  const [teamReviewType, setTeamReviewType] = useState<string>('WEEKLY');
  const [teamReviewDayOfWeek, setTeamReviewDayOfWeek] = useState<number>(1);
  const [teamReviewRecurrenceRule, setTeamReviewRecurrenceRule] = useState<string>('last-friday');
  const [teamReviewTime, setTeamReviewTime] = useState('10:00');
  const [teamReviewDuration, setTeamReviewDuration] = useState(60);
  const [teamReviewMembers, setTeamReviewMembers] = useState<string[]>([]);

  // Pagination for history
  const [historyPage, setHistoryPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [exportFrom, setExportFrom] = useState<string>('');
  const [exportTo, setExportTo] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('csv');
  const [exportScope, setExportScope] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // Handle ?action=start&type=X&date=Y from calendar clicks
  useEffect(() => {
    const action = searchParams.get('action');
    const type = searchParams.get('type');
    const date = searchParams.get('date');

    if (action === 'start' && type && date) {
      // Create a review instance and navigate to the wizard
      (async () => {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewType: type, scheduledDate: `${date}T00:00:00.000Z` }),
        });

        if (res.status === 409) {
          // Already exists — find and navigate to it
          const existing = allReviews.find(
            (r) => r.reviewType === type && !r.completedAt && !r.isTeamReview
          );
          if (existing) {
            router.replace(`/reviews/${existing.id}/complete`);
          } else {
            // Refetch and try again
            const refreshed = await mutateReviews();
            const found = (refreshed || []).find(
              (r: ReviewData) => r.reviewType === type && !r.completedAt && !r.isTeamReview
            );
            if (found) router.replace(`/reviews/${found.id}/complete`);
          }
        } else if (res.ok) {
          const review = await res.json();
          router.replace(`/reviews/${review.id}/complete`);
        }
      })();
    }
  }, [searchParams]);

  // Filter reviews by tab
  const reviews = allReviews.filter((r: ReviewData) =>
    activeTab === 'team' ? r.isTeamReview : !r.isTeamReview
  );

  const { completedReviews, pendingReviews } = useMemo(() => {
    const seen = new Map<string, ReviewData>();
    for (const r of reviews) {
      const dateStr = r.scheduledDate?.split('T')[0] ?? '';
      const key = `${r.reviewType}-${dateStr}-${r.isTeamReview ? 'team' : 'my'}`;
      const existing = seen.get(key);
      if (!existing || (r.completedAt && !existing.completedAt)) {
        seen.set(key, r);
      }
    }
    const deduped = Array.from(seen.values());
    const completed = deduped
      .filter((r: ReviewData) => r.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
    const pending = deduped.filter((r: ReviewData) => !r.completedAt);
    return { completedReviews: completed, pendingReviews: pending };
  }, [reviews]);

  const cancelReview = async (id: string) => {
    if (!confirm('Cancel this review? It will be permanently removed.')) return;
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedReview === id) setSelectedReview(null);
      mutateReviews();
    }
  };

  const handleCreateTeamReview = async () => {
    const body: Record<string, unknown> = {
      reviewType: teamReviewType,
      time: teamReviewTime,
      duration: teamReviewDuration,
      memberIds: teamReviewMembers,
    };
    if (teamReviewType === 'WEEKLY') {
      body.dayOfWeek = teamReviewDayOfWeek;
    } else {
      body.recurrenceRule = teamReviewRecurrenceRule;
    }

    await fetch('/api/team-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setCreatingTeamReview(false);
    mutateTeamConfigs();
  };

  const deleteTeamReview = async (id: string) => {
    if (!confirm('Deactivate this team review?')) return;
    await fetch(`/api/team-reviews/${id}`, { method: 'DELETE' });
    mutateTeamConfigs();
  };

  const handleExport = async () => {
    setExporting(true);
    const params = new URLSearchParams();
    params.set('format', exportFormat);
    if (exportType) params.set('type', exportType);
    if (exportFrom) params.set('from', new Date(exportFrom).toISOString());
    if (exportTo) params.set('to', new Date(exportTo).toISOString());
    if (exportScope) params.set('scope', exportScope);

    try {
      const res = await fetch(`/api/reviews/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Export failed');
        return;
      }

      const blob = exportFormat === 'csv'
        ? await res.blob()
        : new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reviews-export-${getLocalDateString()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;

  const paginatedCompleted = completedReviews.slice(historyPage * ITEMS_PER_PAGE, (historyPage + 1) * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(completedReviews.length / ITEMS_PER_PAGE);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-prism-indigo" />
          Reviews
        </h1>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-gray-700 hover:text-[var(--text-primary)]"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-700/50 pb-0">
        <button
          onClick={() => { setActiveTab('history'); setSelectedReview(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <User className="h-4 w-4" />
          Review History
        </button>
        <button
          onClick={() => { setActiveTab('team'); setSelectedReview(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'team'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Users className="h-4 w-4" />
          Team Reviews
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">

          {/* Team Reviews Tab: Admin management */}
          {activeTab === 'team' && (
            <>
              {/* Active Team Review Schedules */}
              {Array.isArray(teamReviewConfigs) && teamReviewConfigs.length > 0 && (
                <div className="glass-panel p-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-orange-400" />
                    Active Team Schedules
                  </h3>
                  <div className="space-y-2">
                    {teamReviewConfigs.map((tr) => (
                      <div key={tr.id} className="rounded-lg border border-gray-700/50 bg-[var(--surface)] p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${typeColors[tr.reviewType]}`}>
                            {tr.reviewType}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => deleteTeamReview(tr.id)}
                              className="rounded p-1 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                              title="Deactivate"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {tr.reviewType === 'WEEKLY' && tr.dayOfWeek != null
                            ? `${DAY_NAMES[tr.dayOfWeek]}s at ${tr.time}`
                            : tr.recurrenceRule
                              ? `${tr.recurrenceRule} at ${tr.time}`
                              : `at ${tr.time}`
                          }
                          {' · '}{tr.duration}min
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {tr.members.length} member{tr.members.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Create Team Review */}
              {isAdmin && (
                <div className="glass-panel p-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-400" />
                    Create Team Review
                  </h3>
                  {creatingTeamReview ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Review Type</label>
                        <select
                          value={teamReviewType}
                          onChange={(e) => setTeamReviewType(e.target.value)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        >
                          {REVIEW_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      {/* Weekly: day picker */}
                      {teamReviewType === 'WEEKLY' && (
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Day of Week</label>
                          <select
                            value={teamReviewDayOfWeek}
                            onChange={(e) => setTeamReviewDayOfWeek(Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            {DAY_NAMES.map((day, i) => (
                              <option key={i} value={i}>{day}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Monthly: recurrence rule */}
                      {teamReviewType === 'MONTHLY' && (
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Recurrence</label>
                          <select
                            value={teamReviewRecurrenceRule}
                            onChange={(e) => setTeamReviewRecurrenceRule(e.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            {MONTHLY_RECURRENCE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Yearly: recurrence rule */}
                      {teamReviewType === 'YEARLY' && (
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Recurrence</label>
                          <select
                            value={teamReviewRecurrenceRule}
                            onChange={(e) => setTeamReviewRecurrenceRule(e.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          >
                            {YEARLY_RECURRENCE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Time</label>
                          <input
                            type="time"
                            value={teamReviewTime}
                            onChange={(e) => setTeamReviewTime(e.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">Duration (min)</label>
                          <input
                            type="number"
                            min={15}
                            max={480}
                            value={teamReviewDuration}
                            onChange={(e) => setTeamReviewDuration(Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Member selector */}
                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">Members</label>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-2 space-y-1">
                          {Array.isArray(allUsers) && allUsers.map((u) => (
                            <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer text-xs text-[var(--text-secondary)]">
                              <input
                                type="checkbox"
                                checked={teamReviewMembers.includes(u.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTeamReviewMembers(prev => [...prev, u.id]);
                                  } else {
                                    setTeamReviewMembers(prev => prev.filter(id => id !== u.id));
                                  }
                                }}
                                className="rounded border-gray-600"
                              />
                              {u.name || u.email}
                            </label>
                          ))}
                        </div>
                        {teamReviewMembers.length > 0 && (
                          <p className="text-xs text-[var(--text-muted)] mt-1">{teamReviewMembers.length} selected</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateTeamReview}
                          disabled={teamReviewMembers.length === 0}
                          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => setCreatingTeamReview(false)}
                          className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingTeamReview(true)}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-600/30 bg-indigo-600/20 px-3 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30"
                    >
                      <Plus className="h-3 w-3" />
                      New Team Review
                    </button>
                  )}
                </div>
              )}

              {/* Team Reviews: empty state for non-admin */}
              {!isAdmin && (!teamReviewConfigs || teamReviewConfigs.length === 0) && reviews.length === 0 && (
                <div className="glass-panel p-6 text-center">
                  <p className="text-xs text-[var(--text-muted)]">No team reviews scheduled yet. Ask an admin to create one.</p>
                </div>
              )}
            </>
          )}

          {/* Pending reviews (team tab only — individual reviews are started from calendar) */}
          {activeTab === 'team' && pendingReviews.length > 0 && (
            <div className="glass-panel p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Pending Team Reviews ({pendingReviews.length})
              </h3>
              <div className="space-y-2">
                {pendingReviews.map((r: ReviewData) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedReview(r.id)}
                      className={`flex-1 flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                        selectedReview === r.id ? 'bg-indigo-600/20 border border-indigo-600/30' : 'bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${typeColors[r.reviewType]}`}>
                          {r.reviewType}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(r.scheduledDate).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => cancelReview(r.id)}
                        className="rounded p-1 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                        title="Cancel this review"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed reviews */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Completed ({completedReviews.length})
            </h3>
            <div className="space-y-1">
              {paginatedCompleted.map((r: ReviewData) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/reviews/${r.id}/complete?step=1`)}
                  className="w-full flex items-center justify-between text-xs text-[var(--text-secondary)] py-1.5 px-2 rounded hover:bg-[var(--hover-bg)] transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-green-500" />
                    <span>{r.reviewType}</span>
                    {r.isTeamReview && (
                      <Users className="h-3 w-3 text-indigo-400/50" />
                    )}
                  </div>
                  <span className="text-[var(--text-muted)]">{new Date(r.completedAt!).toLocaleDateString()}</span>
                </button>
              ))}
              {completedReviews.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No completed reviews yet.</p>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
                <button
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-[var(--text-muted)]">{historyPage + 1} / {totalPages}</span>
                <button
                  onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={historyPage >= totalPages - 1}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Review detail */}
        <div className="lg:col-span-2">
          {selectedReview ? (() => {
            const selected = allReviews.find((r: ReviewData) => r.id === selectedReview);
            const isPending = selected && !selected.completedAt;

            if (isPending) {
              return (
                <div className="glass-panel p-8 text-center space-y-4">
                  <ClipboardCheck className="h-12 w-12 text-amber-400 mx-auto" />
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {selected.reviewType} Review
                  </h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Scheduled for {new Date(selected.scheduledDate).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => router.push(`/reviews/${selectedReview}/complete`)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                  >
                    <PlayCircle className="h-5 w-5" />
                    Start Review
                  </button>
                </div>
              );
            }

            return (
              <ReviewChecklist
                reviewId={selectedReview}
                onComplete={() => {
                  setSelectedReview(null);
                  mutateReviews();
                }}
              />
            );
          })() : (
            <div className="glass-panel p-12 text-center">
              <p className="text-[var(--text-muted)]">Select a review to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Download className="h-5 w-5 text-indigo-400" />
                Export Reviews
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-gray-800 hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Review Type</label>
                <select
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All Types</option>
                  {REVIEW_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Scope</label>
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All</option>
                  <option value="individual">Individual</option>
                  <option value="team">Team</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">From</label>
                  <input
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">To</label>
                  <input
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Format</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportFormat('csv')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      exportFormat === 'csv'
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-400'
                        : 'border-gray-700 bg-gray-800 text-[var(--text-muted)] hover:bg-gray-700'
                    }`}
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => setExportFormat('json')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      exportFormat === 'json'
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-400'
                        : 'border-gray-700 bg-gray-800 text-[var(--text-muted)] hover:bg-gray-700'
                    }`}
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {exporting ? 'Exporting...' : 'Download'}
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
