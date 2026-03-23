import { addMonths, addWeeks, nextSunday, startOfMonth } from 'date-fns';

export function getNextReviewDate(reviewType: string): Date {
  const now = new Date();
  switch (reviewType) {
    case 'WEEKLY':
      return nextSunday(now);
    case 'MONTHLY':
      return startOfMonth(addMonths(now, 1));
    case 'QUARTERLY': {
      const month = now.getMonth();
      // Quarter starts: Jan(0), Apr(3), Jul(6), Oct(9)
      // Find the next quarter start month that is after the current month
      const nextQ = [3, 6, 9, 12].find((m) => m > month) ?? 3;
      if (nextQ === 12) {
        // Next quarter is January of next year
        return new Date(now.getFullYear() + 1, 0, 1);
      }
      return new Date(now.getFullYear(), nextQ, 1);
    }
    case 'YEARLY':
      return new Date(now.getFullYear() + 1, 0, 1);
    default:
      return addWeeks(now, 1);
  }
}
