import { format, parseISO } from 'date-fns';
import type { RecurringInput } from '../../types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Every month on the 5th", "Every quarter on the 10th", "Every Monday". */
export function scheduleText(r: Pick<RecurringInput, 'frequency' | 'dayOfMonth' | 'weekday' | 'startDate'>): string {
  const start = parseISO(r.startDate);
  if (r.frequency === 'weekly') return `Every ${WEEKDAYS[r.weekday ?? (start.getDay() + 6) % 7]}`;
  const day = r.dayOfMonth ?? start.getDate();
  const on = day >= 31 ? 'on the last day' : `on the ${ordinal(day)}`;
  if (r.frequency === 'monthly') return `Every month ${on}`;
  if (r.frequency === 'quarterly') return `Every 3 months ${on}`;
  return `Every year in ${format(start, 'MMMM')}, ${on.replace('on the ', '')}`;
}

export const dueText = (iso?: string) => (iso ? format(parseISO(iso), 'EEE, d MMM yyyy') : '—');

export { WEEKDAYS };
