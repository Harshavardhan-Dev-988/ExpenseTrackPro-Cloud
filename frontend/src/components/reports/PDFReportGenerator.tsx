import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { generateExpenseReport, type ReportSections } from '../../services/pdfGenerator';
import type { Expense, CategoryBudget } from '../../types';
import { inPeriod, resolvePeriod, type ResolvedPeriod } from '../../utils/period';
import { useToast, errorMessage } from '../ui/toastContext';
import Spinner from '../ui/Spinner';

interface PDFReportGeneratorProps {
  expenses: Expense[];
  budgets: CategoryBudget[];
  currency: string;
  /** The dashboard's currently selected period, offered as the default scope. */
  dashboardPeriod: ResolvedPeriod;
  onClose: () => void;
}

const SECTION_OPTIONS: { key: keyof ReportSections; label: string; hint: string }[] = [
  { key: 'summary', label: 'Summary', hint: 'Totals, daily average, change vs the previous period' },
  { key: 'trend', label: 'Spending over time', hint: 'Bar chart by day, week or month' },
  { key: 'categories', label: 'Categories', hint: 'Category groups and top 15 categories' },
  { key: 'payments', label: 'Payment methods', hint: 'UPI, card, cash…' },
  { key: 'budgets', label: 'Budgets', hint: 'Each budget against the period' },
  { key: 'largest', label: 'Largest expenses', hint: 'Top 10 entries' },
  { key: 'transactions', label: 'Every transaction', hint: 'Full list — adds pages for long periods' },
];

export default function PDFReportGenerator({ expenses, budgets, currency, dashboardPeriod, onClose }: PDFReportGeneratorProps) {
  const toast = useToast();
  const [scope, setScope] = useState<'dashboard' | 'all'>(dashboardPeriod.type === 'all' ? 'all' : 'dashboard');
  const [sections, setSections] = useState<ReportSections>({
    summary: true,
    trend: true,
    categories: true,
    payments: true,
    budgets: true,
    largest: true,
    transactions: false,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTime = useMemo(() => resolvePeriod({ type: 'all' }, expenses), [expenses]);
  const period = scope === 'all' ? allTime : dashboardPeriod;
  const entryCount = useMemo(() => inPeriod(expenses, period.start, period.end).length, [expenses, period]);
  const dashboardCount = useMemo(
    () => inPeriod(expenses, dashboardPeriod.start, dashboardPeriod.end).length,
    [expenses, dashboardPeriod]
  );
  const anySection = Object.values(sections).some(Boolean);
  const transactionPages = sections.transactions ? Math.ceil(entryCount / 38) : 0;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const id = toast.loading('Building your PDF report…', `${period.label} · ${entryCount.toLocaleString('en-IN')} entries`);
    // Let the spinner paint before the (synchronous) PDF build runs.
    await new Promise((resolve) => setTimeout(resolve, 40));
    try {
      const fileName = generateExpenseReport({ allExpenses: expenses, budgets, period, currency, sections });
      toast.update(id, { kind: 'success', title: 'PDF report downloaded', description: fileName });
      onClose();
    } catch (err) {
      console.error('PDF generation error:', err);
      const msg = errorMessage(err, "Couldn't build the PDF.");
      setError(msg);
      toast.update(id, { kind: 'error', title: "Couldn't create the PDF", description: msg });
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => !generating && onClose()}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-ledger"
      >
        <div className="px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 id="pdf-title" className="font-display text-xl font-semibold text-ink">
              Download PDF report
            </h2>
            <p className="text-sm text-slate mt-0.5">A printable summary with charts, categories and budgets.</p>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {error && (
            <p className="text-sm text-ember-strong dark:text-ember bg-ember/10 border border-ember/25 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <fieldset>
            <legend className="text-xs font-mono uppercase tracking-wider text-slate mb-2">Period</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {dashboardPeriod.type !== 'all' && (
                <ScopeOption
                  checked={scope === 'dashboard'}
                  onChange={() => setScope('dashboard')}
                  title={dashboardPeriod.label}
                  hint={`As on the dashboard · ${dashboardCount.toLocaleString('en-IN')} entries`}
                />
              )}
              <ScopeOption
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                title="All time"
                hint={`${expenses.length.toLocaleString('en-IN')} entries`}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-mono uppercase tracking-wider text-slate mb-2">Include</legend>
            <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
              {SECTION_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-paper transition-colors">
                  <input
                    type="checkbox"
                    checked={sections[opt.key]}
                    onChange={() => setSections((s) => ({ ...s, [opt.key]: !s[opt.key] }))}
                    className="mt-0.5 w-4 h-4 accent-pine"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-ink">{opt.label}</span>
                    <span className="block text-xs text-slate">
                      {opt.key === 'transactions' && sections.transactions && entryCount > 0
                        ? `About ${transactionPages} extra page${transactionPages === 1 ? '' : 's'} for ${entryCount.toLocaleString('en-IN')} entries`
                        : opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="px-6 py-4 border-t border-line bg-paper/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 rounded-b-ledger">
          <p className="text-xs text-slate font-mono">
            {entryCount === 0 ? 'No entries in this period' : `${entryCount.toLocaleString('en-IN')} entries · A4`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={generating}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !anySection || expenses.length === 0}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Spinner size="sm" tone="paper" /> Building PDF…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ScopeOption({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        checked ? 'border-pine bg-pine/5' : 'border-line hover:border-pine/60'
      }`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 accent-pine" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-slate">{hint}</span>
      </span>
    </label>
  );
}
