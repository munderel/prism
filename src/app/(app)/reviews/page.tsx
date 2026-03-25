'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { ClipboardCheck, Plus, Calendar, CalendarClock, Check, X, StopCircle, Users, User, Download, PlayCircle } from 'lucide-react';
import { ReviewChecklist } from '@/components/reviews/ReviewChecklist';
import { useRouter } from 'next/navigation';

const REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const typeColors: Record<string, string> = {
  WEEKLY: 'text-green-400 bg-green-600/20 border-green-600/30',
  MONTHLY: 'text-blue-400 bg-blue-600/20 border-blue-600/30',
  QUARTERLY: 'text-purple-400 bg-purple-600/20 border-purple-600/30',
  YEARLY: 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30',
};

const getNextScheduledDate = (type: string): string => {
  const now = new Date();
  switch (type) {
    case 'WEEKLY': {
      const next = new Date(now);
      next.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
      return next.toISOString().split('T')[0];
    }
    case 'MONTHLY': {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return next.toISOString().split('T')[0];
    }
    case 'QUARTERLY': {
      const currentQ = Math.floor(now.getMonth() / 3);
      const next = new Date(now.getFullYear(), (currentQ + 1) * 3, 1);
      return next.toISOString().split('T')[0];
    }
    case 'YEARLY': {
      const next = new Date(now.getFullYear() + 1, 0, 1);
      return next.toISOString().split('T')[0];
    }
    default:
      return now.toISOString().split('T')[0];
  }
};

type TabValue = 'my' | 'team';

export default function ReviewsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const { data: reviewsData, isLoading: loading, mutate: mutateReviews } = useSWR('/api/reviews');
  const allReviews = Array.isArray(reviewsData) ? reviewsData : [];
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [settingUpCadences, setSettingUpCadences] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('team');
  const [creatingTeamReview, setCreatingTeamReview] = useState(false);
  const [teamReviewType, setTeamReviewType] = useState<string>('WEEKLY');

  // Cadence setup: start date + day-of-week
  const [cadenceStartDate, setCadenceStartDate] = useState<string>('');
  const [cadenceDayOfWeek, setCadenceDayOfWeek] = useState<string>('');

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [exportFrom, setExportFrom] = useState<string>('');
  const [exportTo, setExportTo] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('csv');
  const [exportScope, setExportScope] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // Filter reviews by tab
  const reviews = allReviews.filter((r: any) =>
    activeTab === 'team' ? r.isTeamReview : !r.isTeamReview
  );

  const createReview = async (reviewType: string, isTeamReview = false, startDate?: string, recurrenceDayOfWeek?: number) => {
    const payload: any = { reviewType, isTeamReview };
    if (startDate) payload.startDate = startDate;
    if (recurrenceDayOfWeek !== undefined) payload.recurrenceDayOfWeek = recurrenceDayOfWeek;
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) mutateReviews();
  };

  const cancelReview = async (id: string) => {
    if (!confirm('Cancel this review? It will be permanently removed.')) return;
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedReview === id) setSelectedReview(null);
      mutateReviews();
    }
  };

  const stopRecurring = async (reviewType: string) => {
    if (!confirm(`Stop all future ${reviewType} reviews? All pending ${reviewType} reviews will be removed.`)) return;
    const res = await fetch('/api/reviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewType }),
    });
    if (res.ok) {
      if (selectedReview) {
        const sel = reviews.find((r: any) => r.id === selectedReview);
        if (sel && sel.reviewType === reviewType && !sel.completedAt) {
          setSelectedReview(null);
        }
      }
      mutateReviews();
    }
  };

  const handleCreateTeamReview = async () => {
    setCreatingTeamReview(false);
    await createReview(teamReviewType, true);
  };

  const now = new Date();
  const pendingReviews = reviews.filter((r: any) => !r.completedAt);
  const upcomingReviews = pendingReviews.filter((r: any) => new Date(r.scheduledDate) > now);
  const completedReviews = reviews.filter((r: any) => r.completedAt);

  // Determine which cadences already have a pending/upcoming review (only for My Reviews tab)
  const scheduledTypes = new Set(pendingReviews.map((r: any) => r.reviewType));

  const setupCadences = async () => {
    setSettingUpCadences(true);
    const typesToCreate = REVIEW_TYPES.filter((t) => !scheduledTypes.has(t));
    const payload: any = {};
    if (cadenceStartDate) payload.startDate = cadenceStartDate;
    if (cadenceDayOfWeek !== '') payload.recurrenceDayOfWeek = Number(cadenceDayOfWeek);
    await Promise.all(
      typesToCreate.map((reviewType) =>
        fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewType, ...payload }),
        })
      )
    );
    await mutateReviews();
    setSettingUpCadences(false);
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

      if (exportFormat === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reviews-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reviews-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;

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

      {/* Tabs: My Reviews | Team Reviews */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-700/50 pb-0">
        <button
          onClick={() => { setActiveTab('my'); setSelectedReview(null); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'my'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <User className="h-4 w-4" />
          My Reviews
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
          {/* Team Review: Admin create button */}
          {activeTab === 'team' && isAdmin && (
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
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateTeamReview}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
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
          {activeTab === 'team' && !isAdmin && reviews.length === 0 && (
            <div className="glass-panel p-6 text-center">
              <p className="text-xs text-[var(--text-muted)]">No team reviews scheduled yet. Ask an admin to create one.</p>
            </div>
          )}

          {/* Upcoming Reviews */}
          {upcomingReviews.length > 0 && (
            <div className="rounded-xl border border-indigo-600/30 bg-indigo-950/20 p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-400" />
                Upcoming Reviews
              </h3>
              <div className="space-y-2">
                {upcomingReviews.map((r: any) => (
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
                        {r.isTeamReview && (
                          <Users className="h-3 w-3 text-indigo-400" />
                        )}
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(r.scheduledDate).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    {(activeTab === 'my' || isAdmin) && (
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

          {/* Set Up Cadences - only for My Reviews tab */}
          {activeTab === 'my' && (
            <div className="glass-panel p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-400" />
                Review Cadences
              </h3>
              <div className="space-y-2 mb-3">
                {REVIEW_TYPES.map((type) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${typeColors[type]}`}>
                      {type}
                    </span>
                    {scheduledTypes.has(type) ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-green-400">
                          <Check className="h-3 w-3" />
                          Scheduled
                        </span>
                        <button
                          onClick={() => stopRecurring(type)}
                          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-600/20 hover:text-red-300 transition-colors"
                          title={`Stop all future ${type} reviews`}
                        >
                          <StopCircle className="h-3 w-3" />
                          <span className="text-[10px]">Stop</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">{getNextScheduledDate(type)}</span>
                    )}
                  </div>
                ))}
              </div>
              {scheduledTypes.size < REVIEW_TYPES.length && (
                <div className="space-y-3 mt-3 pt-3 border-t border-gray-700/50">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Start Date (optional)</label>
                    <input
                      type="date"
                      value={cadenceStartDate}
                      onChange={(e) => setCadenceStartDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Preferred Day of Week (optional)</label>
                    <select
                      value={cadenceDayOfWeek}
                      onChange={(e) => setCadenceDayOfWeek(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Auto (default)</option>
                      {DAY_NAMES.map((day, idx) => (
                        <option key={day} value={idx}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={setupCadences}
                    disabled={settingUpCadences}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-600/30 bg-indigo-600/20 px-3 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    {settingUpCadences ? 'Setting up...' : `Set Up ${REVIEW_TYPES.length - scheduledTypes.size} Cadence${REVIEW_TYPES.length - scheduledTypes.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
              {scheduledTypes.size === REVIEW_TYPES.length && (
                <p className="text-xs text-green-400/70 text-center">All cadences are set up</p>
              )}
            </div>
          )}

          {/* Quick create buttons - only for My Reviews tab */}
          {activeTab === 'my' && (
            <div className="glass-panel p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Schedule Review</h3>
              <div className="grid grid-cols-2 gap-2">
                {REVIEW_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => createReview(type)}
                    className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:opacity-80 ${typeColors[type]}`}
                  >
                    <Plus className="h-3 w-3" />
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pending reviews */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Pending ({pendingReviews.length})
            </h3>
            <div className="space-y-2">
              {pendingReviews.map((r: any) => (
                <div key={r.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedReview(r.id)}
                    className={`flex-1 flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedReview === r.id ? 'bg-indigo-600/20 border border-indigo-600/30' : 'bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${typeColors[r.reviewType]?.split(' ')[0]}`}>
                          {r.reviewType}
                        </span>
                        {r.isTeamReview && (
                          <Users className="h-3 w-3 text-indigo-400" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        Due: {new Date(r.scheduledDate).toLocaleDateString()}
                      </p>
                    </div>
                    {new Date(r.scheduledDate) < new Date() && (
                      <span className="text-xs text-red-400">Overdue</span>
                    )}
                  </button>
                  {(activeTab === 'my' || isAdmin) && (
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
              {pendingReviews.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No pending reviews.</p>
              )}
            </div>
          </div>

          {/* Completed reviews */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Completed ({completedReviews.length})
            </h3>
            <div className="space-y-1">
              {completedReviews.slice(0, 10).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-[var(--text-muted)] py-1">
                  <div className="flex items-center gap-1.5">
                    <span>{r.reviewType}</span>
                    {r.isTeamReview && (
                      <Users className="h-3 w-3 text-indigo-400/50" />
                    )}
                  </div>
                  <span>{new Date(r.completedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Review detail */}
        <div className="lg:col-span-2">
          {selectedReview ? (() => {
            const selected = allReviews.find((r: any) => r.id === selectedReview);
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
              <p className="text-[var(--text-muted)]">Select a review to begin</p>
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
