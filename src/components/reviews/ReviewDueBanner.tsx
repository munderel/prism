'use client';

import Link from 'next/link';
import { ClipboardCheck, ChevronRight } from 'lucide-react';

export interface ReviewDueItem {
  id: string;
  reviewType: string;
  completedAt: string | null;
  isTeamReview: boolean;
}

interface ReviewDueBannerProps {
  reviews: ReviewDueItem[];
}

export function ReviewDueBanner({ reviews }: ReviewDueBannerProps) {
  const due = reviews.filter((r) => !r.completedAt && !r.isTeamReview);
  if (due.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {due.map((r) => (
        <Link
          key={r.id}
          href={`/reviews/${r.id}/complete`}
          className="flex items-center justify-between gap-3 rounded-lg border border-pink-500/40 bg-pink-500/10 px-4 py-3 transition hover:bg-pink-500/20"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-pink-400" />
            <div>
              <div className="text-sm font-semibold text-pink-300">
                {r.reviewType.charAt(0) + r.reviewType.slice(1).toLowerCase()} Review due today
              </div>
              <div className="text-xs text-[var(--text-muted)]">Tap to complete</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-pink-400" />
        </Link>
      ))}
    </div>
  );
}
