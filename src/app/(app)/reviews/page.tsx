'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ClipboardCheck, Plus, Calendar, CalendarClock, Check, X, StopCircle } from 'lucide-react';
import { ReviewChecklist } from '@/components/reviews/ReviewChecklist';

const REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

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

export default function ReviewsPage() {
  const { data: reviewsData, isLoading: loading, mutate: mutateReviews } = useSWR('/api/reviews');
  const reviews = Array.isArray(reviewsData) ? reviewsData : [];
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [settingUpCadences, setSettingUpCadences] = useState(false);

  const createReview = async (reviewType: string) => {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewType }),
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
        const sel = reviews.find((r) => r.id === selectedReview);
        if (sel && sel.reviewType === reviewType && !sel.completedAt) {
          setSelectedReview(null);
        }
      }
      mutateReviews();
    }
  };

  const now = new Date();
  const pendingReviews = reviews.filter((r) => !r.completedAt);
  const upcomingReviews = pendingReviews.filter((r) => new Date(r.scheduledDate) > now);
  const completedReviews = reviews.filter((r) => r.completedAt);

  // Determine which cadences already have a pending/upcoming review
  const scheduledTypes = new Set(pendingReviews.map((r) => r.reviewType));

  const setupCadences = async () => {
    setSettingUpCadences(true);
    const typesToCreate = REVIEW_TYPES.filter((t) => !scheduledTypes.has(t));
    await Promise.all(
      typesToCreate.map((reviewType) =>
        fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewType }),
        })
      )
    );
    await mutateReviews();
    setSettingUpCadences(false);
  };

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-prism-indigo" />
          Reviews
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Upcoming Reviews */}
          {upcomingReviews.length > 0 && (
            <div className="rounded-xl border border-indigo-600/30 bg-indigo-950/20 p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-400" />
                Upcoming Reviews
              </h3>
              <div className="space-y-2">
                {upcomingReviews.map((r) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedReview(r.id)}
                      className={`flex-1 flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                        selectedReview === r.id ? 'bg-indigo-600/20 border border-indigo-600/30' : 'bg-gray-800/50 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${typeColors[r.reviewType]}`}>
                          {r.reviewType}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(r.scheduledDate).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => cancelReview(r.id)}
                      className="rounded p-1 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                      title="Cancel this review"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Set Up Cadences */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
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
                    <span className="text-gray-600">{getNextScheduledDate(type)}</span>
                  )}
                </div>
              ))}
            </div>
            {scheduledTypes.size < REVIEW_TYPES.length && (
              <button
                onClick={setupCadences}
                disabled={settingUpCadences}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-600/30 bg-indigo-600/20 px-3 py-2 text-xs font-medium text-indigo-400 transition-colors hover:bg-indigo-600/30 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {settingUpCadences ? 'Setting up...' : `Set Up ${REVIEW_TYPES.length - scheduledTypes.size} Cadence${REVIEW_TYPES.length - scheduledTypes.size === 1 ? '' : 's'}`}
              </button>
            )}
            {scheduledTypes.size === REVIEW_TYPES.length && (
              <p className="text-xs text-green-400/70 text-center">All cadences are set up</p>
            )}
          </div>

          {/* Quick create buttons */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Schedule Review</h3>
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

          {/* Pending reviews */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Pending ({pendingReviews.length})
            </h3>
            <div className="space-y-2">
              {pendingReviews.map((r) => (
                <div key={r.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedReview(r.id)}
                    className={`flex-1 flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                      selectedReview === r.id ? 'bg-indigo-600/20 border border-indigo-600/30' : 'bg-gray-800/50 hover:bg-gray-800'
                    }`}
                  >
                    <div>
                      <span className={`text-xs font-medium ${typeColors[r.reviewType]?.split(' ')[0]}`}>
                        {r.reviewType}
                      </span>
                      <p className="text-xs text-gray-500">
                        Due: {new Date(r.scheduledDate).toLocaleDateString()}
                      </p>
                    </div>
                    {new Date(r.scheduledDate) < new Date() && (
                      <span className="text-xs text-red-400">Overdue</span>
                    )}
                  </button>
                  <button
                    onClick={() => cancelReview(r.id)}
                    className="rounded p-1 text-red-400/60 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                    title="Cancel this review"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {pendingReviews.length === 0 && (
                <p className="text-xs text-gray-600">No pending reviews.</p>
              )}
            </div>
          </div>

          {/* Completed reviews */}
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Completed ({completedReviews.length})
            </h3>
            <div className="space-y-1">
              {completedReviews.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-gray-500 py-1">
                  <span>{r.reviewType}</span>
                  <span>{new Date(r.completedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Review detail */}
        <div className="lg:col-span-2">
          {selectedReview ? (
            <ReviewChecklist
              reviewId={selectedReview}
              onComplete={() => {
                setSelectedReview(null);
                mutateReviews();
              }}
            />
          ) : (
            <div className="glass-panel p-12 text-center">
              <p className="text-gray-600">Select a review to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
