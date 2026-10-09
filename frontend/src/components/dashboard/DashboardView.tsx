/**
 * The dashboard: one period (picked in the toolbar) read top-down —
 * headline total and its change, the trend, four key facts, where the money
 * went and what was recorded lately, then the supporting charts.
 *
 * Period maths (what "this month" covers, what it's compared with, how a
 * monthly budget applies to a quarter) lives in utils/period.ts so the PDF
 * report agrees with the screen.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { addMonths, format, parseISO, startOfMonth } from 'date-fns';
import type { CategoryBudget, CategoryStats, CategoryType, Expense } from '../../types';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/constants';
import { formatMoney } from '../../utils/helpers';
import {
  bucketSeries,
  budgetWindow,
  computeBudgetStatus,
  inPeriod,
  previousPeriod,
  sumAmount,
  type DashboardRange,
  type ResolvedPeriod,
} from '../../utils/period';
import LedgerLineChart from '../charts/LedgerLineChart';
import CategoryPieChart from '../charts/CategoryPieChart';
import PaymentMethodChart from '../charts/PaymentMethodChart';
import WeekdaySpendingChart from '../charts/WeekdaySpendingChart';
import DailyExpensesChart from '../charts/DailyExpensesChart';
import CategoryBreakdown from './CategoryBreakdown';
import RecentActivity from './RecentActivity';
import StatTile from '../ui/StatTile';
import CountUp from '../ui/CountUp';

interface DashboardViewProps {
  allExpenses: Expense[];
  expenses: Expense[]; // already filtered to `period`
  period: ResolvedPeriod;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  budgets: CategoryBudget[];
  categoryStats: CategoryStats[];
  currency: string;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onSelectCategory: (category: CategoryType) => void;
  onOpenPdf: () => void;
  onOpenWalkthrough: () => void;
  onGoToExpenses: () => void;
  onGoToBudgets: () => void;
}

const ease = [0.16, 1, 0.3, 1] as const;
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease },
});

const svg = (d: string) => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
  </svg>
);
const ICON = {
  tag: svg('M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z'),
  receipt: svg('M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z'),
  calendar: svg('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'),
  target: svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'),
  card: svg('M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'),
  pdf: svg('M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'),
  walk: svg('M13 5a2 2 0 11-4 0 2 2 0 014 0zM10 21l1.5-6.5L14 17v4m-6-9l2-3 3 1 2 3 2 1'),
  chevL: svg('M15 19l-7-7 7-7'),
  chevR: svg('M9 5l7 7-7 7'),
};

const RANGE_TABS: { type: DashboardRange['type']; label: string }[] = [
  { type: 'today', label: 'Today' },
  { type: 'month', label: 'Month' },
  { type: 'year', label: 'Year' },
  { type: 'all', label: 'All time' },
  { type: 'custom', label: 'Custom' },
];

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section data-snapshot-block className={`card-surface p-5 sm:p-6 ${className}`} {...reveal(delay)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Period toolbar
// ---------------------------------------------------------------------------
function PeriodToolbar({
  range,
  onRangeChange,
  period,
  entryCount,
  onOpenPdf,
  onOpenWalkthrough,
  earliest,
}: {
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
  period: ResolvedPeriod;
  entryCount: number;
  onOpenPdf: () => void;
  onOpenWalkthrough: () => void;
  earliest: Date | null;
}) {
  const now = new Date();
  const monthValue = range.month || format(now, 'yyyy-MM');
  const yearValue = Number(range.year || now.getFullYear());
  const stepMonth = (delta: number) =>
    onRangeChange({ type: 'month', month: format(addMonths(parseISO(`${monthValue}-01`), delta), 'yyyy-MM') });
  const atCurrentMonth = monthValue >= format(now, 'yyyy-MM');
  // Every month from the first recorded expense (or 3 years back) to now.
  const monthOptions = useMemo(() => {
    const first = earliest ? startOfMonth(earliest) : addMonths(startOfMonth(now), -36);
    const list: string[] = [];
    for (let d = startOfMonth(now); d >= first && list.length < 240; d = addMonths(d, -1)) list.push(format(d, 'yyyy-MM'));
    if (!list.includes(monthValue)) list.push(monthValue);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earliest, monthValue]);
  const atCurrentYear = yearValue >= now.getFullYear();
  const input =
    'h-9 px-2.5 text-sm border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-pine font-mono tabular';
  const stepBtn =
    'h-9 w-9 inline-flex items-center justify-center rounded-lg border border-line bg-surface text-slate hover:text-ink hover:border-pine transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div data-snapshot-exclude className="card-surface p-2 sm:p-2.5 mb-5 flex flex-col lg:flex-row lg:items-center gap-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
        <div className="flex gap-1 bg-paper rounded-lg p-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Period">
          {RANGE_TABS.map(({ type, label }) => {
            const active = range.type === type;
            return (
              <button
                key={type}
                role="tab"
                aria-selected={active}
                onClick={() => onRangeChange(type === range.type ? range : { type })}
                className={`relative flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors duration-200 ${
                  active ? 'text-paper' : 'text-slate hover:text-ink'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="date-range-pill"
                    className="absolute inset-0 bg-pine rounded-md shadow-ledger"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        {range.type === 'month' && (
          <div className="flex items-center gap-1.5">
            <button className={stepBtn} onClick={() => stepMonth(-1)} aria-label="Previous month">
              {ICON.chevL}
            </button>
            <select
              value={monthValue}
              onChange={(e) => onRangeChange({ type: 'month', month: e.target.value })}
              className={`${input} flex-1 sm:flex-none sm:min-w-[150px]`}
              aria-label="Month"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                </option>
              ))}
            </select>
            <button className={stepBtn} onClick={() => stepMonth(1)} disabled={atCurrentMonth} aria-label="Next month">
              {ICON.chevR}
            </button>
          </div>
        )}

        {range.type === 'year' && (
          <div className="flex items-center gap-1.5">
            <button className={stepBtn} onClick={() => onRangeChange({ type: 'year', year: String(yearValue - 1) })} aria-label="Previous year">
              {ICON.chevL}
            </button>
            <select
              value={yearValue}
              onChange={(e) => onRangeChange({ type: 'year', year: e.target.value })}
              className={`${input} flex-1 sm:flex-none`}
              aria-label="Year"
            >
              {Array.from({ length: 10 }, (_, i) => now.getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              className={stepBtn}
              onClick={() => onRangeChange({ type: 'year', year: String(yearValue + 1) })}
              disabled={atCurrentYear}
              aria-label="Next year"
            >
              {ICON.chevR}
            </button>
          </div>
        )}

        {range.type === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={range.startDate || ''}
              onChange={(e) => onRangeChange({ ...range, type: 'custom', startDate: e.target.value })}
              className={`${input} flex-1 min-w-0`}
              aria-label="From"
            />
            <span className="text-xs text-slate">to</span>
            <input
              type="date"
              value={range.endDate || ''}
              onChange={(e) => onRangeChange({ ...range, type: 'custom', endDate: e.target.value })}
              className={`${input} flex-1 min-w-0`}
              aria-label="To"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <span className="text-xs font-mono text-slate mr-auto lg:mr-1 pl-1 whitespace-nowrap">
          {entryCount.toLocaleString('en-IN')} entr{entryCount === 1 ? 'y' : 'ies'}
        </span>
        {entryCount > 0 && (
          <button
            type="button"
            onClick={onOpenWalkthrough}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-slate hover:text-ink hover:bg-paper transition-colors"
          >
            {ICON.walk}
            <span>Walk through</span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenPdf}
          disabled={entryCount === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-surface text-xs font-medium text-ink hover:border-pine hover:text-pine-strong transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title={`Download a PDF report for ${period.label}`}
        >
          {ICON.pdf}
          <span>PDF</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget strip — compact, period-aware replacement for the old wall of cards
// ---------------------------------------------------------------------------
function BudgetStrip({
  statuses,
  phrase,
  onManage,
  currency,
}: {
  statuses: ReturnType<typeof computeBudgetStatus>;
  phrase: string;
  onManage: () => void;
  currency: string;
}) {
  const flagged = statuses.filter((s) => s.state !== 'ok');
  const over = flagged.filter((s) => s.state === 'exceeded').length;
  const close = flagged.length - over;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  if (!flagged.length || dismissedFor === phrase) return null;

  return (
    <motion.div
      {...reveal()}
      data-snapshot-block
      className={`card-surface mb-5 p-3 sm:p-3.5 border-l-4 ${over ? 'border-l-ember' : 'border-l-brass'} flex flex-col sm:flex-row sm:items-center gap-3`}
      role="status"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            over ? 'bg-ember/12 text-ember-strong dark:text-ember' : 'bg-brass/12 text-brass-strong dark:text-brass'
          }`}
          aria-hidden="true"
        >
          {ICON.target}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {over > 0 && `${over} budget${over === 1 ? '' : 's'} over limit`}
            {over > 0 && close > 0 && ', '}
            {close > 0 && `${close} getting close`}
            <span className="font-normal text-slate"> · {phrase}</span>
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {flagged.slice(0, 4).map((s) => (
              <span
                key={s.category}
                title={`${formatMoney(s.spent, currency)} of ${formatMoney(s.limit, currency)}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  s.state === 'exceeded'
                    ? 'bg-ember/10 text-ember-strong dark:text-ember'
                    : 'bg-brass/10 text-brass-strong dark:text-brass'
                }`}
              >
                {CATEGORY_LABELS[s.category] || s.category}
                <span className="font-mono tabular">{Math.round(s.pct)}%</span>
              </span>
            ))}
            {flagged.length > 4 && <span className="text-[11px] text-slate self-center">+{flagged.length - 4} more</span>}
          </div>
        </div>
      </div>
      <div data-snapshot-exclude className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onManage}
          className="px-3 py-1.5 text-xs rounded-lg font-medium border border-line bg-surface text-ink hover:border-pine hover:text-pine-strong transition-colors"
        >
          Review budgets
        </button>
        <button
          onClick={() => setDismissedFor(phrase)}
          className="p-1.5 rounded-md text-slate hover:text-ink hover:bg-paper transition-colors"
          aria-label="Dismiss budget alert"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function DashboardView({
  allExpenses,
  expenses,
  period,
  range,
  onRangeChange,
  budgets,
  categoryStats,
  currency,
  onAddExpense,
  onEditExpense,
  onSelectCategory,
  onOpenPdf,
  onOpenWalkthrough,
  onGoToExpenses,
  onGoToBudgets,
}: DashboardViewProps) {
  const money = (n: number) => formatMoney(n, currency);
  const now = new Date();

  const total = useMemo(() => sumAmount(expenses), [expenses]);
  const earliest = useMemo(
    () => (allExpenses.length ? new Date(Math.min(...allExpenses.map((e) => new Date(e.date).getTime()))) : null),
    [allExpenses]
  );

  // Days that have actually elapsed in the period (a running month
  // shouldn't have its daily average diluted by days still to come).
  const elapsedDays = useMemo(() => {
    const end = period.end > now ? now : period.end;
    return Math.max(1, Math.ceil((end.getTime() - period.start.getTime()) / 86400000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const comparison = useMemo(() => {
    const prev = previousPeriod(period);
    if (!prev) return null;
    const prevTotal = sumAmount(inPeriod(allExpenses, prev.start, prev.end));
    if (prevTotal <= 0) return null;
    return { label: prev.label, prevTotal, change: ((total - prevTotal) / prevTotal) * 100 };
  }, [period, allExpenses, total]);

  const series = useMemo(() => {
    const end = period.end > now ? now : period.end;
    return bucketSeries(expenses, period.start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, period]);

  const budgetInfo = useMemo(() => {
    const win = budgetWindow(period);
    const statuses = computeBudgetStatus(budgets, inPeriod(allExpenses, win.start, win.end), win.months);
    return { statuses, phrase: win.phrase };
  }, [budgets, allExpenses, period]);

  const facts = useMemo(() => {
    const ranked = [...categoryStats].filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
    const top = ranked[0];
    const largest = expenses.reduce<Expense | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    expenses.forEach((e) => (byDay[new Date(e.date).getDay()] += e.amount));
    const busiestIdx = byDay.indexOf(Math.max(...byDay));
    const byMethod = new Map<string, number>();
    expenses.forEach((e) => byMethod.set(e.paymentMethod || 'other', (byMethod.get(e.paymentMethod || 'other') || 0) + e.amount));
    const topMethod = [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0];
    return { top, largest, busiestIdx, busiestAmount: byDay[busiestIdx], topMethod };
  }, [categoryStats, expenses]);

  const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const budgetTotals = budgetInfo.statuses.reduce(
    (acc, s) => ({ spent: acc.spent + s.spent, limit: acc.limit + s.limit }),
    { spent: 0, limit: 0 }
  );
  const budgetPct = budgetTotals.limit > 0 ? (budgetTotals.spent / budgetTotals.limit) * 100 : 0;
  const overCount = budgetInfo.statuses.filter((s) => s.state === 'exceeded').length;
  const closeCount = budgetInfo.statuses.filter((s) => s.state === 'warning').length;
  const granularityLabel = series.granularity === 'day' ? 'Daily' : series.granularity === 'week' ? 'Weekly' : 'Monthly';

  return (
    <div id="dashboard-snapshot">
      {/* Only rendered into the PDF snapshot (see services/dashboardSnapshot). */}
      <div data-snapshot-only data-snapshot-block className="mb-5">
        <div className="flex items-end justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-pine flex items-center justify-center">
              <span className="text-lg font-display font-semibold text-paper">₹</span>
            </span>
            <div>
              <p className="font-display text-xl font-semibold text-ink leading-tight">ExpenseTrack Pro</p>
              <p className="text-xs font-mono uppercase tracking-wide text-slate">Dashboard · {period.label}</p>
            </div>
          </div>
          <p className="text-xs font-mono text-slate text-right">
            {expenses.length.toLocaleString('en-IN')} entries
            <br />
            Exported {format(new Date(), 'd MMM yyyy, h:mm a')}
          </p>
        </div>
      </div>

      <PeriodToolbar
        range={range}
        onRangeChange={onRangeChange}
        period={period}
        entryCount={expenses.length}
        onOpenPdf={onOpenPdf}
        onOpenWalkthrough={onOpenWalkthrough}
        earliest={earliest}
      />

      <AnimatePresence>
        <BudgetStrip statuses={budgetInfo.statuses} phrase={budgetInfo.phrase} onManage={onGoToBudgets} currency={currency} />
      </AnimatePresence>

      {expenses.length === 0 ? (
        <div className="card-surface border-dashed p-12 text-center mb-8">
          <h3 className="text-lg font-display font-semibold text-ink mb-2">
            {allExpenses.length === 0 ? 'Your ledger is empty' : `Nothing recorded for ${period.label}`}
          </h3>
          <p className="text-sm text-slate mb-5 max-w-sm mx-auto">
            {allExpenses.length === 0
              ? 'Add your first expense to start the line.'
              : 'Pick a different period, or add an expense for this one.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={onAddExpense}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong transition-colors"
            >
              Add expense
            </button>
            {allExpenses.length > 0 && range.type !== 'all' && (
              <button
                onClick={() => onRangeChange({ type: 'all' })}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine transition-colors"
              >
                View all time
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Hero: total, change, key rates, trend */}
          <motion.section data-snapshot-block className="card-surface relative overflow-hidden p-5 sm:p-7 mb-5" {...reveal()}>
            <div className="aura aura-pine" aria-hidden="true" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-5 mb-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate font-mono mb-1.5">Spent · {period.label}</p>
                <p className="font-display text-4xl sm:text-5xl font-semibold text-ink tabular leading-none">
                  <CountUp value={total} formatter={(n) => formatMoney(n, currency)} />
                </p>
                {comparison && (
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono tabular ${
                        comparison.change > 0
                          ? 'bg-ember/10 text-ember-strong dark:text-ember'
                          : 'bg-pine/10 text-pine-strong dark:text-pine'
                      }`}
                    >
                      {comparison.change > 0 ? '▲' : '▼'} {Math.abs(comparison.change).toFixed(1)}%
                    </span>
                    <span className="text-slate">
                      vs {comparison.label} <span className="font-mono tabular">({money(comparison.prevTotal)})</span>
                    </span>
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-4 sm:gap-8 md:text-right">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate font-mono mb-1">Entries</dt>
                  <dd className="font-mono tabular text-lg sm:text-xl font-semibold text-ink">{expenses.length.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate font-mono mb-1">Per day</dt>
                  <dd className="font-mono tabular text-lg sm:text-xl font-semibold text-ink">{money(Math.round(total / elapsedDays))}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate font-mono mb-1">Per entry</dt>
                  <dd className="font-mono tabular text-lg sm:text-xl font-semibold text-ink">{money(Math.round(total / expenses.length))}</dd>
                </div>
              </dl>
            </div>
            <div className="relative z-10">
              <LedgerLineChart
                data={series.points}
                currency={currency}
                accent="pine"
                height={220}
                granularity={series.granularity}
                ariaLabel={`${granularityLabel} spending for ${period.label}`}
              />
              <p className="mt-1 text-[11px] font-mono text-slate">
                {granularityLabel} totals<span data-snapshot-exclude> · hover for detail</span>
              </p>
            </div>
          </motion.section>

          {/* Key facts */}
          <div data-snapshot-block className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
            {facts.top && (
              <StatTile
                icon={ICON.tag}
                label="Top category"
                value={<span className="block truncate font-body">{CATEGORY_LABELS[facts.top.category] || facts.top.category}</span>}
                sublabel={`${money(facts.top.total)} · ${total > 0 ? Math.round((facts.top.total / total) * 100) : 0}% of spend`}
                delay={0}
              />
            )}
            {facts.largest && (
              <StatTile
                icon={ICON.receipt}
                label="Largest"
                value={money(facts.largest.amount)}
                sublabel={<span className="truncate block">{facts.largest.description}</span>}
                tone="brass"
                delay={0.04}
              />
            )}
            {budgetInfo.statuses.length > 0 ? (
              <StatTile
                icon={ICON.target}
                label="Budget used"
                value={`${Math.round(budgetPct)}%`}
                sublabel={
                  overCount > 0
                    ? `${overCount} of ${budgetInfo.statuses.length} over · ${budgetInfo.phrase}`
                    : closeCount > 0
                      ? `${closeCount} getting close · ${budgetInfo.phrase}`
                      : `All ${budgetInfo.statuses.length} on track · ${budgetInfo.phrase}`
                }
                tone={budgetPct >= 100 || overCount > 0 ? 'ember' : budgetPct >= 80 || closeCount > 0 ? 'brass' : 'pine'}
                delay={0.08}
              />
            ) : (
              <StatTile
                icon={ICON.card}
                label="Paid mostly by"
                value={
                  facts.topMethod
                    ? (PAYMENT_METHOD_LABELS as Record<string, string>)[facts.topMethod[0]] || facts.topMethod[0]
                    : '—'
                }
                sublabel={facts.topMethod ? `${Math.round((facts.topMethod[1] / total) * 100)}% of spend` : undefined}
                delay={0.08}
              />
            )}
            <StatTile
              icon={ICON.calendar}
              label="Busiest day"
              value={dayNames[facts.busiestIdx]}
              sublabel={`${money(facts.busiestAmount)} in total`}
              delay={0.12}
            />
          </div>

          {/* Where it went + Recent activity */}
          <div data-snapshot-block className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
            <SectionCard
              className="lg:col-span-2"
              title="Where it went"
              subtitle={`${categoryStats.filter((s) => s.total > 0).length} categories · tap one for its entries`}
              delay={0.05}
            >
              <CategoryBreakdown
                stats={categoryStats.filter((s) => s.total > 0)}
                total={total}
                currency={currency}
                onSelectCategory={onSelectCategory}
              />
            </SectionCard>
            <SectionCard
              className="lg:col-span-3"
              title="Recent activity"
              subtitle="Latest entries in this period · tap to edit"
              delay={0.1}
              action={
                <button data-snapshot-exclude onClick={onAddExpense} className="text-xs font-medium text-pine hover:text-pine-strong transition-colors whitespace-nowrap">
                  + Add
                </button>
              }
            >
              <RecentActivity expenses={expenses} currency={currency} onEdit={onEditExpense} onViewAll={onGoToExpenses} />
            </SectionCard>
          </div>

          {/* Supporting charts */}
          <div data-snapshot-block className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 lg:items-stretch">
            <motion.div data-snapshot-block className="h-full" {...reveal(0.15)}>
              <CategoryPieChart categoryStats={categoryStats.filter((s) => s.total > 0)} currency={currency} compact />
            </motion.div>
            <div className="h-full flex flex-col gap-5">
              <motion.div data-snapshot-block {...reveal(0.2)}>
                <PaymentMethodChart expenses={expenses} currency={currency} compact />
              </motion.div>
              <motion.div data-snapshot-block className="flex-1 min-h-[160px]" {...reveal(0.25)}>
                <WeekdaySpendingChart expenses={expenses} currency={currency} compact fillHeight />
              </motion.div>
            </div>
          </div>

          <motion.div className="mb-8" data-snapshot-block {...reveal(0.3)}>
            <DailyExpensesChart expenses={allExpenses} />
          </motion.div>
        </>
      )}
    </div>
  );
}
