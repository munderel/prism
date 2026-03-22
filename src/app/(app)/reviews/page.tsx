'use client';

import { useState, useEffect } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { ReviewChecklist } from '@/components/reviews/ReviewChecklist';

const REVIEW_TYPES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

const typeColors: Record<string, string> = {
  WEEKLY: 'text-green-400 bg-green-600/20 border-green-600/30',
  MONTHLY: 'text-blue-400 bg-blue-600/20 border-blue-600/30',
  QUARTERLY: 'text-purple-400 bg-purple-600/20 border-purple-600/30',
  YEARLY: 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30',
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    const res = await fetch('/api/reviews');
    if (res.ok) setReviews(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchReviews(); }, []);

  const createReview = async (reviewType: string) => {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewType }),
    });
    if (res.ok) fetchReviews();
  };

  const pendingReviews = reviews.filter((r) => !r.completedAt);
  const completedReviews = reviews.filter((r) => r.completedAt);

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-indigo-400" />
          Reviews
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Quick create buttons */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
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
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Pending ({pendingReviews.length})
            </h3>
            <div className="space-y-2">
              {pendingReviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReview(r.id)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
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
              ))}
              {pendingReviews.length === 0 && (
                <p className="text-xs text-gray-600">No pending reviews.</p>
              )}
            </div>
          </div>

          {/* Completed reviews */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
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
                fetchReviews();
              }}
            />
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
              <p className="text-gray-600">Select a review to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
