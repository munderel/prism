import { ProcessCadence } from '@prisma/client';
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';

export function computeNextDueDate(cadence: ProcessCadence, from: Date = new Date()): Date {
  switch (cadence) {
    case 'DAILY': return addDays(from, 1);
    case 'WEEKLY': return addWeeks(from, 1);
    case 'BIWEEKLY': return addWeeks(from, 2);
    case 'MONTHLY': return addMonths(from, 1);
    case 'QUARTERLY': return addMonths(from, 3);
    case 'YEARLY': return addYears(from, 1);
  }
}
