import { addMonths, addWeeks, startOfMonth } from 'date-fns';

export function getNextReviewDate(reviewType: string): Date {
  const now = new Date(Date.now());
  switch (reviewType) {
    case 'WEEKLY':
      return addWeeks(now, 1);
    case 'MONTHLY':
      return startOfMonth(addMonths(now, 1));
    case 'YEARLY':
      return new Date(now.getFullYear() + 1, 0, 1);
    default:
      return addWeeks(now, 1);
  }
}
