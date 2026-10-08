import { format } from 'date-fns';
import type { Expense } from '../../types';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/constants';
import { getCategoryIcon } from '../../utils/helpers';
import cloudApi from '../../services/cloudApi';
import { formatMoney } from '../../utils/helpers';
import { useToast } from '../ui/toastContext';

interface ExpenseListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  /** Asks for confirmation itself (see App's requestDeleteExpense). */
  onDelete: (expense: Expense) => void;
  title?: string;
  currency?: string;
}

export default function ExpenseList({ expenses, onEdit, onDelete, title = 'Recent Expenses', currency = 'INR' }: ExpenseListProps) {
  const toast = useToast();

  const openReceipt = async (key: string) => {
    // Open the tab synchronously (inside the click) so popup blockers allow
    // it, then point it at the presigned URL once that comes back.
    const tab = window.open('', '_blank');
    try {
      const viewUrl = await cloudApi.getReceiptViewUrl(key);
      if (tab) tab.location.href = viewUrl;
      else window.open(viewUrl, '_blank', 'noopener,noreferrer');
    } catch {
      tab?.close();
      toast.error("Couldn't open that receipt", 'Try again in a moment.');
    }
  };

  if (expenses.length === 0) {
    return null;
  }

  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-line">
        <h2 className="font-display text-xl font-semibold text-ink">
          {title}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-paper">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-mono text-slate uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-mono text-slate uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-mono text-slate uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-mono text-slate uppercase tracking-wider">
                Payment
              </th>
              <th className="px-6 py-3 text-right text-xs font-mono text-slate uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-mono text-slate uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {sortedExpenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-paper transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-ink font-mono tabular">
                  {format(new Date(expense.date), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4 text-sm text-ink">
                  <div className="max-w-xs truncate flex items-center gap-2">
                    <span aria-hidden="true">{getCategoryIcon(expense.category)}</span>
                    <span className="truncate">{expense.description}</span>
                    {expense.receiptUrl && (
                      <button
                        type="button"
                        onClick={() => openReceipt(expense.receiptUrl!)}
                        title="View receipt"
                        aria-label="View attached receipt"
                        className="text-slate hover:text-pine transition-colors shrink-0"
                      >
                        📎
                      </button>
                    )}
                  </div>
                  {expense.tags && expense.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {expense.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-0.5 text-xs bg-line/60 text-slate rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-ink">
                  {expense.category ? (CATEGORY_LABELS[expense.category] || expense.category) : 'Unknown'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate">
                  {expense.paymentMethod ? PAYMENT_METHOD_LABELS[expense.paymentMethod] || expense.paymentMethod : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono tabular font-semibold text-right text-ink">
                  {formatMoney(expense.amount, currency)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => onEdit(expense)}
                    className="text-pine hover:text-pine-strong transition-colors mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(expense)}
                    className="text-slate hover:text-ember-strong dark:hover:text-ember transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
