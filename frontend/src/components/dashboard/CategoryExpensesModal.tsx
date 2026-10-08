import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';
import type { Expense, CategoryType, PaymentMethod } from '../../types';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/constants';
import { getCategoryIcon, getCategoryGroup, formatMoney } from '../../utils/helpers';

interface CategoryExpensesModalProps {
  category: CategoryType;
  /** Every expense in this category for the dashboard's current period —
   * already filtered by the caller, so this component only has to render
   * and let the person search/sort/act on what it's given. */
  expenses: Expense[];
  /** The dashboard's grand total for the period, used to show this
   * category's share alongside its own numbers. */
  periodTotal: number;
  currency: string;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onAddNew: (category: CategoryType) => void;
}

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const SORT_LABELS: Record<SortMode, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'amount-desc': 'Highest amount',
  'amount-asc': 'Lowest amount',
};

const dayLabel = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d, yyyy');
};

/**
 * The popup behind every row in "Where it went" — a category summary you
 * can actually act on, not just a bigger number. Opens on top of the
 * dashboard with the same modal chrome as the rest of the app, and lets
 * the person search, re-sort, edit, delete, or add straight into this one
 * category without leaving the popup.
 */
export default function CategoryExpensesModal({
  category,
  expenses,
  periodTotal,
  currency,
  onClose,
  onEdit,
  onDelete,
  onAddNew,
}: CategoryExpensesModalProps) {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [sortOpen, setSortOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const group = getCategoryGroup(category);
  const color = group?.color || '#2F4D3F';
  const label = CATEGORY_LABELS[category] || category;

  const stats = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const count = expenses.length;
    const average = count > 0 ? total / count : 0;
    const highest = count > 0 ? Math.max(...expenses.map((e) => e.amount)) : 0;
    return { total, count, average, highest };
  }, [expenses]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      const key = e.paymentMethod || 'other';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? expenses.filter(
          (e) =>
            e.description.toLowerCase().includes(q) ||
            (e.tags || []).some((t) => t.toLowerCase().includes(q)) ||
            (e.paymentMethod || '').toLowerCase().includes(q)
        )
      : expenses;

    return [...list].sort((a, b) => {
      switch (sortMode) {
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'date-desc':
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [expenses, query, sortMode]);

  const pctOfTotal = periodTotal > 0 ? (stats.total / periodTotal) * 100 : 0;

  // App's requestDeleteExpense opens the confirmation dialog (it stacks
  // above this modal) and handles the toast.
  const handleDelete = (expense: Expense) => onDelete(expense);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} entries`}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.2 } }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="relative overflow-hidden px-5 sm:px-6 py-5 border-b border-line shrink-0">
          <div
            className="absolute inset-0 opacity-[0.12] pointer-events-none"
            style={{ background: `radial-gradient(circle at 12% -10%, ${color}, transparent 60%)` }}
            aria-hidden="true"
          />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: `${color}22`, boxShadow: `0 0 0 1px ${color}40` }}
                aria-hidden="true"
              >
                {getCategoryIcon(category)}
              </motion.span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-ink truncate">{label}</h2>
                <p className="text-xs text-slate font-mono truncate">
                  {group?.name ? `${group.name} · ` : ''}
                  {stats.count} {stats.count === 1 ? 'entry' : 'entries'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Stat row */}
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            {[
              { label: 'Total', value: formatMoney(stats.total, currency) },
              { label: 'Of spending', value: `${pctOfTotal.toFixed(1)}%` },
              { label: 'Average', value: formatMoney(stats.average, currency) },
              { label: 'Highest', value: formatMoney(stats.highest, currency) },
            ].map((cell, i) => (
              <motion.div
                key={cell.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-lg px-2.5 py-2 min-w-0"
                style={{ background: `${color}14` }}
              >
                <p className="text-[9px] uppercase tracking-wide text-slate font-mono mb-0.5 truncate">{cell.label}</p>
                <p className="font-mono tabular text-sm font-semibold text-ink truncate">{cell.value}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Controls: search + sort */}
        <div className="px-5 sm:px-6 py-3 border-b border-line flex items-center gap-2.5 shrink-0">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate/70 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search these entries..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-line bg-paper text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine transition-colors"
            />
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-line bg-paper text-ink hover:border-pine transition-colors whitespace-nowrap"
            >
              {SORT_LABELS[sortMode]}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <AnimatePresence>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 z-20 w-40 card-surface py-1"
                  >
                    {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setSortMode(mode);
                          setSortOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          mode === sortMode ? 'text-pine-strong dark:text-pine font-semibold bg-pine/10' : 'text-ink hover:bg-paper'
                        }`}
                      >
                        {SORT_LABELS[mode]}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate text-center py-12">
              {expenses.length === 0 ? 'No entries left in this category for this period.' : 'No entries match your search.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              <AnimatePresence initial={false}>
                {filtered.map((expense, index) => (
                  <motion.li
                    key={expense.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.35), ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => onEdit(expense)}
                      className="flex-1 min-w-0 flex items-center gap-3 py-2.5 px-2 text-left rounded-md hover:bg-paper transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-ink truncate">{expense.description || 'Untitled entry'}</span>
                        <span className="block text-xs text-slate font-mono truncate">
                          {dayLabel(new Date(expense.date))}
                          {expense.paymentMethod && <> · {PAYMENT_METHOD_LABELS[expense.paymentMethod]}</>}
                        </span>
                        {expense.tags && expense.tags.length > 0 && (
                          <span className="flex gap-1 mt-1 flex-wrap">
                            {expense.tags.map((tag) => (
                              <span key={tag} className="inline-block px-1.5 py-0.5 text-[10px] bg-line/60 text-slate rounded-full">
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular text-sm font-semibold text-ink shrink-0">
                        {formatMoney(expense.amount, currency)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(expense)}
                      aria-label={`Delete ${expense.description || 'entry'}`}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-slate/60 hover:text-ember-strong dark:hover:text-ember hover:bg-ember/10 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0l-.6 12.2A2 2 0 0114.4 21H9.6a2 2 0 01-2-1.8L7 7h10z"
                        />
                      </svg>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate truncate hidden sm:block">
            {paymentBreakdown.length > 0 &&
              paymentBreakdown
                .map(([m, c]) => `${PAYMENT_METHOD_LABELS[m as PaymentMethod] || m} (${c})`)
                .join(' · ')}
          </p>
          <button
            type="button"
            onClick={() => onAddNew(category)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-paper text-sm font-semibold shadow-ledger hover:brightness-110 active:scale-[0.98] transition-all duration-200 shrink-0 ml-auto"
            style={{ backgroundColor: color }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add {label}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
