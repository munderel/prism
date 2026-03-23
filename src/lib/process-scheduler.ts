import { ProcessCadence } from '@prisma/client';

export function computeNextDueDate(cadence: ProcessCadence, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (cadence) {
    case 'DAILY': next.setDate(next.getDate() + 1); break;
    case 'WEEKLY': next.setDate(next.getDate() + 7); break;
    case 'BIWEEKLY': next.setDate(next.getDate() + 14); break;
    case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
    case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break;
    case 'YEARLY': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}
