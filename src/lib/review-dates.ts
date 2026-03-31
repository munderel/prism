import { addMonths, addWeeks, startOfMonth } from 'date-fns';

export function getNextReviewDate(reviewType: string): Date {
  const now = new Date();
  switch (reviewType) {
    case 'MONTHLY':
      return startOfMonth(addMonths(now, 1));
    case 'YEARLY':
      return new Date(now.getFullYear() + 1, 0, 1);
    case 'WEEKLY':
    default:
      return addWeeks(now, 1);
  }
}
