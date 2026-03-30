import { prisma } from '@/lib/prisma';
import { ReviewWizard } from '@/components/reviews/ReviewWizard';
import { WeeklyReviewWizard } from '@/components/reviews/WeeklyReviewWizard';
import { MonthlyReviewWizard } from '@/components/reviews/MonthlyReviewWizard';
import { YearlyReviewWizard } from '@/components/reviews/YearlyReviewWizard';
import { ClipboardList } from 'lucide-react';

const REVIEW_TITLES: Record<string, string> = {
  WEEKLY: 'Weekly Review',
  MONTHLY: 'Monthly Review',
  YEARLY: 'Yearly Review',
};

export default async function ReviewCompletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch review type to decide which wizard to render
  const review = await prisma.review.findUnique({
    where: { id },
    select: { reviewType: true, isTeamReview: true },
  });

  const reviewType = review?.reviewType ?? null;
  const isTeamReview = review?.isTeamReview ?? false;
  const title = (reviewType && REVIEW_TITLES[reviewType]) || 'Complete Review';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-amber-400" />
          {title}
        </h1>
      </div>
      {reviewType === 'WEEKLY' ? (
        <WeeklyReviewWizard reviewId={id} isTeamReview={isTeamReview} />
      ) : reviewType === 'MONTHLY' ? (
        <MonthlyReviewWizard reviewId={id} isTeamReview={isTeamReview} />
      ) : reviewType === 'YEARLY' ? (
        <YearlyReviewWizard reviewId={id} isTeamReview={isTeamReview} />
      ) : (
        <ReviewWizard reviewId={id} />
      )}
    </div>
  );
}
