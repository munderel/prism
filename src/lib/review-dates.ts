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

/** Day-of-week index map for rule parsing: sunday=0, monday=1, ... saturday=6. */
const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/** Check whether a zoned date matches a monthly recurrence rule.
 *  Supported formats:
 *    - `last-{day}`  — last occurrence of that weekday in the month (e.g. 'last-sunday')
 *    - `1st-{day}`   — first occurrence of that weekday in the month (e.g. '1st-wednesday')
 *    - `2nd-{day}`   — second occurrence (e.g. '2nd-tuesday')
 *    - `3rd-{day}`   — third occurrence (e.g. '3rd-thursday')
 *    - `{n}th`       — specific day-of-month (e.g. '15th', '1st-day', '28th')
 */
export function matchesMonthlyRule(d: Date, rule: string): boolean {
  const day = d.getDay();
  const date = d.getDate();
  const month = d.getMonth();
  const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();

  // "last-{weekday}" — last occurrence of that day in the month
  if (rule.startsWith('last-')) {
    const dayName = rule.slice(5);
    const targetDow = DAY_INDEX[dayName];
    if (targetDow == null) return false;
    const lastDate = new Date(d.getFullYear(), month + 1, 0);
    const diff = (lastDate.getDay() - targetDow + 7) % 7;
    return date === lastDay - diff;
  }

  // "1st-{weekday}" — first occurrence of that day in the month
  if (rule.startsWith('1st-')) {
    const dayName = rule.slice(4);
    const targetDow = DAY_INDEX[dayName];
    if (targetDow == null) return false;
    return date <= 7 && day === targetDow;
  }

  // "2nd-{weekday}" — second occurrence
  if (rule.startsWith('2nd-')) {
    const dayName = rule.slice(4);
    const targetDow = DAY_INDEX[dayName];
    if (targetDow == null) return false;
    return date > 7 && date <= 14 && day === targetDow;
  }

  // "3rd-{weekday}" — third occurrence
  if (rule.startsWith('3rd-')) {
    const dayName = rule.slice(4);
    const targetDow = DAY_INDEX[dayName];
    if (targetDow == null) return false;
    return date > 14 && date <= 21 && day === targetDow;
  }

  // "{n}th" — specific day-of-month (e.g. '15th', '1st-day', '28th')
  const nthMatch = rule.match(/^(\d+)(?:st|nd|rd|th)$/);
  if (nthMatch) {
    return date === parseInt(nthMatch[1]);
  }

  return false;
}

/** Check whether a zoned date matches a yearly recurrence rule (e.g. 'dec-30', 'last-sat-dec', 'custom:MM-DD'). */
export function matchesYearlyRule(d: Date, rule: string): boolean {
  const month = d.getMonth();
  const date = d.getDate();

  switch (rule) {
    case 'dec-30': return month === 11 && date === 30;
    case 'dec-31': return month === 11 && date === 31;
    case 'last-sat-dec': {
      if (month !== 11) return false;
      const lastDate = new Date(d.getFullYear(), 12, 0);
      const lastDay = lastDate.getDate();
      const diff = (lastDate.getDay() - 6 + 7) % 7;
      return date === lastDay - diff;
    }
    default: {
      if (rule.startsWith('custom:')) {
        const parts = rule.slice(7).split('-');
        const ruleMonth = parseInt(parts[0]) - 1;
        const ruleDay = parseInt(parts[1]);
        return month === ruleMonth && date === ruleDay;
      }
      return false;
    }
  }
}
