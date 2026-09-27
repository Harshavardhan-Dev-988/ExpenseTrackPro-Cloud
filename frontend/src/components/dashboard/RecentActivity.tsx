import { motion } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';
import type { Expense } from '../../types';
import { getCategoryIcon, formatMoney } from '../../utils/helpers';
import { CATEGORY_LABELS } from '../../utils/constants';

interface RecentActivityProps {
  expenses: Expense[];
  currency: string;
  limit?: number;
  onEdit: (expense: Expense) => void;
  onViewAll: () => void;
}

const dayLabel = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
};

/**
 * The right-hand column of the dashboard hero — the month read as a
 * sequence of ledger entries rather than an anonymous "recent" widget.
 * Reuses the exact same handleEditExpense flow as the Expenses tab.
 */
export default function RecentActivity({ expenses, currency, limit = 8, onEdit, onViewAll }: RecentActivityProps) {
  const recent = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  if (recent.length === 0) {
    return <p className="text-sm text-slate">No entries in this ledger yet.</p>;
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-line">
        {recent.map((expense, index) => (
          <motion.li
            key={expense.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={() => onEdit(expense)}
              className="w-full flex items-center gap-3 py-2.5 text-left rounded-md px-2 -mx-2 hover:bg-paper transition-colors"
            >
              <span className="text-lg shrink-0" aria-hidden="true">
                {getCategoryIcon(expense.category)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">{expense.description}</span>
                <span className="block text-xs text-slate font-mono">
                  {dayLabel(new Date(expense.date))} · {CATEGORY_LABELS[expense.category] || expense.category}
                </span>
              </span>
              <span className="font-mono tabular text-sm font-semibold text-ink shrink-0">
                {formatMoney(expense.amount, currency)}
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onViewAll}
        className="mt-3 self-start text-xs font-medium text-pine hover:text-pine-strong transition-colors"
      >
        View full ledger →
      </button>
    </div>
  );
}
