import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { CategoryType, PaymentMethod, Expense } from '../../types';
import { CATEGORY_GROUPS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/constants';

interface ExpenseFormProps {
  expense?: Expense;
  onSubmit: (expense: {
    date: Date;
    amount: number;
    category: CategoryType;
    description: string;
    paymentMethod?: PaymentMethod;
    tags?: string[];
  }) => Promise<void>;
  onCancel: () => void;
}

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  cash: '💵',
  card: '💳',
  upi: '📱',
  netbanking: '🏦',
  cheque: '🧾',
  other: '⋯',
};

/**
 * The "add expense" moment, redesigned as writing one line in a ledger
 * rather than filling out a form: the amount comes first because it's the
 * number that matters emotionally, then category/payment/date read almost
 * like a sentence, and a category chip-picker replaces the native <select>
 * so the app's 80-category taxonomy stays browsable instead of a giant
 * alphabetic dropdown.
 */
export default function ExpenseForm({ expense, onSubmit, onCancel }: ExpenseFormProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryType>('grocery');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [tags, setTags] = useState('');
  const [showTags, setShowTags] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (expense) {
      setDate(new Date(expense.date).toISOString().split('T')[0]);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setDescription(expense.description);
      setPaymentMethod(expense.paymentMethod || 'cash');
      setTags(expense.tags?.join(', ') || '');
      setShowTags(!!expense.tags?.length);
    } else {
      amountRef.current?.focus();
    }
  }, [expense]);

  const paymentMethods: PaymentMethod[] = ['cash', 'card', 'upi', 'netbanking', 'cheque', 'other'];
  const selectedGroup = CATEGORY_GROUPS.find((g) => g.categories.includes(category));

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!date) newErrors.date = 'Add a date';
    if (!amount || parseFloat(amount) <= 0) newErrors.amount = 'Add an amount';
    if (!description.trim()) newErrors.description = 'Say what this was for';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        date: new Date(date),
        amount: parseFloat(amount),
        category,
        description: description.trim(),
        paymentMethod,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      });
      setDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setCategory('grocery');
      setDescription('');
      setPaymentMethod('cash');
      setTags('');
      setShowTags(false);
      setErrors({});
    } catch {
      setErrors({ submit: "Couldn't save that entry — try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={expense ? 'Edit expense' : 'Add expense'}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">
                {expense ? 'Edit entry' : 'New ledger entry'}
              </h2>
              <p className="text-xs text-slate mt-0.5">
                {expense ? 'Update the details of this entry.' : 'One line — what happened, and how much.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Amount — the number that matters, written first and large */}
            <div>
              <label htmlFor="expense-amount" className="sr-only">Amount</label>
              <div className={`flex items-baseline gap-2 rounded-lg border px-4 py-3 transition-colors ${errors.amount ? 'border-ember' : 'border-line focus-within:border-pine'}`}>
                <span className="font-display text-2xl text-slate">₹</span>
                <input
                  ref={amountRef}
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent font-display text-4xl font-semibold text-ink tabular placeholder:text-line focus:outline-none"
                />
              </div>
              {errors.amount && <p className="text-ember text-xs mt-1.5">{errors.amount}</p>}
            </div>

            {/* Category + date — each control clearly labeled rather than
                leaning on a "sentence" of connector words to explain itself. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate font-mono mb-1.5">Category</p>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="w-full inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-line bg-paper hover:border-pine transition-colors font-medium text-sm text-ink"
                  aria-expanded={pickerOpen}
                >
                  <span aria-hidden="true">{selectedGroup?.icon}</span>
                  <span className="truncate">{CATEGORY_LABELS[category] || category}</span>
                  <svg className={`w-3 h-3 text-slate transition-transform ml-auto shrink-0 ${pickerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <div>
                <label htmlFor="expense-date" className="text-[10px] uppercase tracking-wide text-slate font-mono mb-1.5 block">Date</label>
                <input
                  id="expense-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={`w-full px-3 py-2.5 rounded-lg border bg-paper text-sm text-ink focus:outline-none transition-colors ${errors.date ? 'border-ember' : 'border-line focus:border-pine'}`}
                />
              </div>
            </div>
            {errors.date && <p className="text-ember text-xs -mt-3">{errors.date}</p>}

            {/* Payment method — labeled, not icon-only, so the selection is
                legible at a glance instead of requiring a hover to decode
                an emoji (💳 vs 🏦 vs 🧾 read ambiguously at small sizes). */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate font-mono mb-1.5">Payment method</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="radiogroup" aria-label="Payment method">
                {paymentMethods.map((method) => {
                  const selected = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 px-1 transition-colors ${
                        selected
                          ? 'border-pine bg-pine text-paper shadow-ledger'
                          : 'border-line bg-paper text-ink hover:border-pine/60 hover:bg-line/30'
                      }`}
                    >
                      <span className="text-base leading-none" aria-hidden="true">{PAYMENT_ICONS[method]}</span>
                      <span className={`text-[10px] font-medium leading-tight text-center ${selected ? 'text-paper' : 'text-ink/80'}`}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category chip picker — grouped, matches the app's own taxonomy */}
            <AnimatePresence initial={false}>
              {pickerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border border-line rounded-lg p-3 max-h-56 overflow-y-auto flex flex-col gap-3">
                    {CATEGORY_GROUPS.map((group) => (
                      <div key={group.name}>
                        <p className="text-[10px] uppercase tracking-wide text-slate font-mono mb-1.5 flex items-center gap-1.5">
                          <span aria-hidden="true">{group.icon}</span>
                          {group.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.categories.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                setCategory(cat);
                                setPickerOpen(false);
                              }}
                              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                                category === cat ? 'bg-pine text-paper' : 'bg-paper text-ink hover:bg-line/60'
                              }`}
                            >
                              {CATEGORY_LABELS[cat] || cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Description */}
            <div>
              <label htmlFor="expense-description" className="sr-only">Description</label>
              <input
                id="expense-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this for?"
                className={`w-full px-3.5 py-2.5 rounded-lg border bg-surface text-ink placeholder:text-slate/70 focus:outline-none transition-colors ${
                  errors.description ? 'border-ember' : 'border-line focus:border-pine'
                }`}
              />
              {errors.description && <p className="text-ember text-xs mt-1.5">{errors.description}</p>}
            </div>

            {/* Tags — optional, tucked away until asked for */}
            {showTags ? (
              <div>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="tags, comma separated"
                  className="w-full px-3.5 py-2 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine"
                  autoFocus
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTags(true)}
                className="self-start text-xs text-slate hover:text-pine transition-colors"
              >
                + add tags
              </button>
            )}

            {errors.submit && (
              <p className="text-sm text-ember bg-ember/10 rounded-lg px-3.5 py-2.5">{errors.submit}</p>
            )}

            <div className="flex gap-3 pt-1">
              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.98 }}
                className="flex-1 px-6 py-3 bg-pine text-paper rounded-lg font-semibold disabled:opacity-60 transition-colors hover:bg-pine-strong"
              >
                {isSubmitting ? 'Recording…' : expense ? 'Save changes' : 'Record entry'}
              </motion.button>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-5 py-3 rounded-lg border border-line text-ink hover:border-pine transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
