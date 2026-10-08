/**
 * Date-range helpers shared by the dashboard and the PDF report, so both
 * always agree on what "this month" covers, what it's compared against,
 * and how a budget limit applies to it.
 */
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import type { CategoryBudget, CategoryType, Expense } from '../types';

export type RangeType = 'all' | 'today' | 'month' | 'year' | 'custom';

export interface DashboardRange {
  type: RangeType;
  startDate?: string; // yyyy-MM-dd
  endDate?: string; // yyyy-MM-dd
  month?: string; // yyyy-MM
  year?: string; // yyyy
}

export interface ResolvedPeriod {
  type: RangeType;
  start: Date;
  end: Date;
  /** "October 2026", "2025", "All time", "Today (Oct 8, 2026)"… */
  label: string;
  /** Lower-case phrase for sentences: "this month", "2025", "all time". */
  phrase: string;
  days: number;
}

const ts = (e: Expense) => new Date(e.date).getTime();

export function resolvePeriod(range: DashboardRange, expenses: Expense[], now = new Date()): ResolvedPeriod {
  const make = (type: RangeType, start: Date, end: Date, label: string, phrase: string): ResolvedPeriod => ({
    type,
    start,
    end,
    label,
    phrase,
    days: Math.max(1, differenceInCalendarDays(end, start) + 1),
  });

  switch (range.type) {
    case 'today':
      return make('today', startOfDay(now), endOfDay(now), `Today (${format(now, 'MMM d, yyyy')})`, 'today');
    case 'month': {
      const anchor = range.month ? parseISO(`${range.month}-01`) : now;
      const label = format(anchor, 'MMMM yyyy');
      return make('month', startOfMonth(anchor), endOfMonth(anchor), label, isSameMonth(anchor, now) ? 'this month' : label);
    }
    case 'year': {
      const anchor = range.year ? new Date(Number(range.year), 0, 1) : now;
      const label = format(anchor, 'yyyy');
      return make('year', startOfYear(anchor), endOfYear(anchor), label, isSameYear(anchor, now) ? 'this year' : label);
    }
    case 'custom': {
      const times = expenses.map(ts);
      const start = range.startDate
        ? startOfDay(parseISO(range.startDate))
        : times.length
          ? startOfDay(new Date(Math.min(...times)))
          : startOfDay(now);
      const end = range.endDate ? endOfDay(parseISO(range.endDate)) : endOfDay(now);
      const parts = [];
      if (range.startDate) parts.push(format(start, 'MMM d, yyyy'));
      if (range.endDate) parts.push(format(end, 'MMM d, yyyy'));
      const label =
        parts.length === 2 ? `${parts[0]} – ${parts[1]}` : range.startDate ? `Since ${parts[0]}` : range.endDate ? `Until ${parts[0]}` : 'Custom range';
      return make('custom', start, end, label, 'the selected period');
    }
    case 'all':
    default: {
      const times = expenses.map(ts);
      const start = times.length ? startOfDay(new Date(Math.min(...times))) : startOfDay(now);
      const latest = times.length ? new Date(Math.max(...times)) : now;
      const end = endOfDay(latest > now ? latest : now);
      return make('all', start, end, 'All time', 'all time');
    }
  }
}

export function inPeriod(expenses: Expense[], start: Date, end: Date): Expense[] {
  const s = start.getTime();
  const e = end.getTime();
  return expenses.filter((x) => {
    const t = ts(x);
    return t >= s && t <= e;
  });
}

export const sumAmount = (expenses: Expense[]) => expenses.reduce((acc, e) => acc + e.amount, 0);

/**
 * The equivalent earlier window to compare a period against. For the
 * current (still running) month or year it's like-for-like: Oct 1–8 vs
 * Sep 1–8, not Oct 1–8 vs all of September.
 */
export function previousPeriod(period: ResolvedPeriod, now = new Date()): { start: Date; end: Date; label: string } | null {
  switch (period.type) {
    case 'today': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'yesterday' };
    }
    case 'month': {
      const prevStart = startOfMonth(subMonths(period.start, 1));
      if (isSameMonth(period.start, now)) {
        const dayCount = differenceInCalendarDays(now, period.start);
        const prevEnd = endOfDay(addDays(prevStart, dayCount));
        return { start: prevStart, end: prevEnd > endOfMonth(prevStart) ? endOfMonth(prevStart) : prevEnd, label: `same point in ${format(prevStart, 'MMMM')}` };
      }
      return { start: prevStart, end: endOfMonth(prevStart), label: format(prevStart, 'MMMM yyyy') };
    }
    case 'year': {
      const prevStart = startOfYear(subYears(period.start, 1));
      if (isSameYear(period.start, now)) {
        const dayCount = differenceInCalendarDays(now, period.start);
        return { start: prevStart, end: endOfDay(addDays(prevStart, dayCount)), label: `same point in ${format(prevStart, 'yyyy')}` };
      }
      return { start: prevStart, end: endOfYear(prevStart), label: format(prevStart, 'yyyy') };
    }
    case 'custom': {
      const end = endOfDay(subDays(period.start, 1));
      const start = startOfDay(subDays(period.start, period.days));
      return { start, end, label: `the previous ${period.days} days` };
    }
    default:
      return null;
  }
}

export type Granularity = 'day' | 'week' | 'month';

/** Spending bucketed so a 2-year range is 24 readable points, not 730 spikes. */
export function bucketSeries(
  expenses: Expense[],
  start: Date,
  end: Date
): { granularity: Granularity; points: { date: Date; value: number }[] } {
  const days = differenceInCalendarDays(end, start) + 1;
  const granularity: Granularity = days <= 62 ? 'day' : days <= 400 ? 'week' : 'month';
  const keyOf = (d: Date) =>
    granularity === 'day' ? startOfDay(d) : granularity === 'week' ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d);

  const map = new Map<number, number>();
  // Seed every bucket so quiet stretches read as zero, not as a straight
  // line drawn across the gap.
  let cursor = keyOf(start);
  const last = keyOf(end).getTime();
  let guard = 0;
  while (cursor.getTime() <= last && guard++ < 1000) {
    map.set(cursor.getTime(), 0);
    cursor =
      granularity === 'day' ? addDays(cursor, 1) : granularity === 'week' ? addDays(cursor, 7) : startOfMonth(addDays(endOfMonth(cursor), 1));
  }
  expenses.forEach((e) => {
    const k = keyOf(new Date(e.date)).getTime();
    map.set(k, (map.get(k) || 0) + e.amount);
  });
  const points = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([k, value]) => ({ date: new Date(k), value }));
  return { granularity, points };
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export type BudgetState = 'ok' | 'warning' | 'exceeded';

export interface BudgetStatus {
  budget: CategoryBudget;
  category: CategoryType;
  spent: number;
  /** The budget's limit scaled to the period being looked at. */
  limit: number;
  pct: number;
  state: BudgetState;
}

/**
 * Budgets are monthly or yearly amounts; a period is whatever the person
 * picked. Compare like with like: a ₹13,000/month grocery budget viewed
 * over a quarter is ₹39,000, and over "today" it's judged against the
 * current month (a single day isn't a meaningful budget window).
 */
export function budgetWindow(period: ResolvedPeriod, now = new Date()): { start: Date; end: Date; months: number; phrase: string } {
  if (period.type === 'today') {
    return { start: startOfMonth(now), end: endOfMonth(now), months: 1, phrase: 'this month' };
  }
  if (period.type === 'month') return { start: period.start, end: period.end, months: 1, phrase: period.phrase };
  if (period.type === 'year') return { start: period.start, end: period.end, months: 12, phrase: period.phrase };
  return { start: period.start, end: period.end, months: Math.max(1, period.days / 30.4375), phrase: period.phrase };
}

export function computeBudgetStatus(budgets: CategoryBudget[], expensesInWindow: Expense[], months: number): BudgetStatus[] {
  const spentBy = new Map<string, number>();
  expensesInWindow.forEach((e) => spentBy.set(e.category, (spentBy.get(e.category) || 0) + e.amount));

  return budgets
    .filter((b) => b.isActive)
    .map((budget) => {
      const type = budget.budgetType || 'monthly';
      const base = type === 'yearly' ? (budget.yearlyLimit || 0) / 12 : budget.monthlyLimit || 0;
      const limit = base * months;
      const spent = spentBy.get(budget.category) || 0;
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      const state: BudgetState = pct >= 100 ? 'exceeded' : pct >= (budget.alertThreshold || 80) ? 'warning' : 'ok';
      return { budget, category: budget.category, spent, limit, pct, state };
    })
    .filter((s) => s.limit > 0)
    .sort((a, b) => b.pct - a.pct);
}
