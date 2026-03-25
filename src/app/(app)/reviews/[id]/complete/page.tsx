'use client';

import { use } from 'react';
import { ReviewWizard } from '@/components/reviews/ReviewWizard';
import { ClipboardList } from 'lucide-react';

export default function ReviewCompletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-amber-400" />
          Complete Review
        </h1>
      </div>
      <ReviewWizard reviewId={id} />
    </div>
  );
}
