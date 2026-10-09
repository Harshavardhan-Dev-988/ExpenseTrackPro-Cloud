import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useExpenses } from './hooks/useExpenses';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import { useAnalytics } from './hooks/useAnalytics';
import { useExportActions } from './hooks/useExportActions';
import AppHeader from './components/layout/AppHeader';
import type { View } from './components/layout/nav';
import DashboardView from './components/dashboard/DashboardView';
import ExpenseForm from './components/forms/ExpenseForm';
import ExpenseList from './components/expenses/ExpenseList';
import ExpenseFilters from './components/expenses/ExpenseFilters';
import CategoryExpensesModal from './components/dashboard/CategoryExpensesModal';
import BulkUpload from './components/forms/BulkUpload';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import BudgetManager from './components/budgets/BudgetManager';
import BudgetsView from './components/budgets/BudgetsView';
import BackupRestore from './components/backup/BackupRestore';
import WhatsAppLink from './components/whatsapp/WhatsAppLink';
import PDFReportGenerator from './components/reports/PDFReportGenerator';
import SavingsTracker from './components/savings/SavingsTracker';
import Spinner from './components/ui/Spinner';
import { useToast, errorMessage } from './components/ui/toastContext';
import { useConfirm } from './components/ui/confirmContext';
import { generateId, formatMoney } from './utils/helpers';
import { cloudApi as db } from './services/cloudApi';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from './utils/constants';
import { inPeriod, resolvePeriod, type DashboardRange } from './utils/period';
import type { Expense, CategoryType, PaymentMethod, CategoryBudget } from './types';
// Lazy-loaded: three.js + @react-three/fiber are a sizeable chunk that
// only the "Walk through" button ever needs — nobody who just wants to
// check a total should pay for it on first load.
const Walkthrough3D = lazy(() => import('./components/walkthrough/Walkthrough3D'));

const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap';

// The dashboard's period is remembered per browser — a per-viewer
// convenience, so storage failures (private mode etc.) are simply ignored.
const RANGE_KEY = 'etp:dashboardRange';
function loadRange(): DashboardRange {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardRange;
      if (parsed && typeof parsed.type === 'string') return parsed;
    }
  } catch {
    /* ignore */
  }
  return { type: 'month' };
}

function App() {
  const toast = useToast();
  const confirm = useConfirm();

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showBudgetManager, setShowBudgetManager] = useState(false);
  const [showBackupRestore, setShowBackupRestore] = useState(false);
  const [showWhatsAppLink, setShowWhatsAppLink] = useState(false);
  const [showPDFGenerator, setShowPDFGenerator] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  // "Where it went" → click a category → this popup with every entry
  // behind that bar. quickAddCategory pre-selects a category when the
  // popup's own "+ Add" button opens the same ExpenseForm used everywhere else.
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [quickAddCategory, setQuickAddCategory] = useState<CategoryType | undefined>(undefined);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>(loadRange);
  const [filters, setFilters] = useState<{
    searchText: string;
    categories: CategoryType[];
    paymentMethods: PaymentMethod[];
    dateFrom: string;
    dateTo: string;
    minAmount: string;
    maxAmount: string;
  }>({
    searchText: '',
    categories: [],
    paymentMethods: [],
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
  });

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify(dashboardRange));
    } catch {
      /* ignore */
    }
  }, [dashboardRange]);

  const loadBudgets = useCallback(async () => {
    try {
      setBudgets(await db.getAllBudgets());
    } catch (error) {
      console.error('Failed to load budgets:', error);
      toast.error("Couldn't load your budgets", errorMessage(error));
    }
  }, [toast]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  const { settings, loading: settingsLoading, error: settingsError, updateSettings, refreshSettings } = useSettings();
  const { signOut } = useAuth();
  const {
    expenses,
    loading: expensesLoading,
    refreshing,
    error: expensesError,
    addExpense,
    addExpenses,
    updateExpense,
    deleteExpense,
    refreshExpenses,
  } = useExpenses();
  const currency = settings.currency;
  const money = useCallback((n: number) => formatMoney(n, currency), [currency]);

  // Resolve 'system' to an actual light/dark reading so the toggle shows
  // (and switches away from) whatever is currently on screen.
  const prefersDarkSystem = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode = settings.theme === 'dark' || (settings.theme === 'system' && prefersDarkSystem);
  const toggleTheme = async () => {
    try {
      await updateSettings({ theme: isDarkMode ? 'light' : 'dark' });
    } catch (error) {
      toast.error("Couldn't save your theme", errorMessage(error));
    }
  };

  // Current month spending by category (Budgets tab / budget manager)
  const currentMonthSpending = useMemo(() => {
    const now = new Date();
    return inPeriod(expenses, startOfMonth(now), endOfMonth(now)).reduce(
      (acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
      },
      {} as Record<CategoryType, number>
    );
  }, [expenses]);

  // Dashboard period → filtered expenses
  const dashboardPeriod = useMemo(() => resolvePeriod(dashboardRange, expenses), [dashboardRange, expenses]);
  const dashboardExpenses = useMemo(
    () => inPeriod(expenses, dashboardPeriod.start, dashboardPeriod.end),
    [expenses, dashboardPeriod]
  );
  const { totalExpenses, averageExpense, categoryStats } = useAnalytics(dashboardExpenses);
  const { exportData, exportSummary } = useExportActions({
    expenses,
    budgets,
    totalExpenses,
    averageExpense,
    categoryStats,
  });

  // Title for the Expenses tab list based on active filters
  const getExpenseListTitle = () => {
    const filterParts: string[] = [];
    if (filters.searchText) filterParts.push(`"${filters.searchText}"`);
    if (filters.categories.length > 0) {
      if (filters.categories.length <= 3) {
        filterParts.push(filters.categories.map((cat) => CATEGORY_LABELS[cat] || cat).join(', '));
      } else {
        filterParts.push(`${filters.categories.length} Categories`);
      }
    }
    if (filters.paymentMethods.length > 0) {
      filterParts.push(
        filters.paymentMethods.length === 1
          ? (PAYMENT_METHOD_LABELS as Record<string, string>)[filters.paymentMethods[0]]
          : `${filters.paymentMethods.length} Payment Methods`
      );
    }
    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom && filters.dateTo) {
        filterParts.push(`${format(new Date(filters.dateFrom), 'MMM dd, yyyy')} - ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`);
      } else if (filters.dateFrom) {
        filterParts.push(`From ${format(new Date(filters.dateFrom), 'MMM dd, yyyy')}`);
      } else {
        filterParts.push(`Until ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`);
      }
    }
    if (filters.minAmount || filters.maxAmount) {
      if (filters.minAmount && filters.maxAmount) filterParts.push(`₹${filters.minAmount} - ₹${filters.maxAmount}`);
      else if (filters.minAmount) filterParts.push(`≥ ₹${filters.minAmount}`);
      else filterParts.push(`≤ ₹${filters.maxAmount}`);
    }
    return filterParts.length === 0 ? 'All expenses' : `Expenses: ${filterParts.join(' • ')}`;
  };

  const filteredExpenses = expenses.filter((expense) => {
    if (filters.searchText && !expense.description.toLowerCase().includes(filters.searchText.toLowerCase())) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(expense.category)) return false;
    if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(expense.paymentMethod || 'cash')) return false;
    if (filters.dateFrom && new Date(expense.date) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(expense.date) > new Date(filters.dateTo)) return false;
    if (filters.minAmount && expense.amount < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && expense.amount > parseFloat(filters.maxAmount)) return false;
    return true;
  });

  // ---- expense actions -------------------------------------------------------
  const handleAddExpense = async (expenseData: {
    date: Date;
    amount: number;
    category: CategoryType;
    description: string;
    paymentMethod?: PaymentMethod;
    tags?: string[];
    receiptUrl?: string;
  }) => {
    // Errors propagate to ExpenseForm, which shows them inline and keeps
    // the form open so nothing typed is lost.
    if (editingExpense) {
      await updateExpense({ ...editingExpense, ...expenseData, updatedAt: new Date() });
      toast.success('Changes saved', `${money(expenseData.amount)} · ${expenseData.description}`);
      setEditingExpense(null);
    } else {
      await addExpense(expenseData);
      toast.success('Entry recorded', `${money(expenseData.amount)} · ${expenseData.description}`);
    }
    setShowExpenseForm(false);
    setQuickAddCategory(undefined);
  };

  const handleEditExpense = (expense: Expense) => {
    setSelectedCategory(null);
    setEditingExpense(expense);
    setShowExpenseForm(true);
  };

  const openAddExpenseForm = (category?: CategoryType) => {
    setEditingExpense(null);
    setQuickAddCategory(category);
    setShowExpenseForm(true);
  };

  const requestDeleteExpense = async (expense: Expense) => {
    const deleted = await confirm({
      title: 'Delete this expense?',
      message: "It'll be removed from your ledger, totals and budgets. This can't be undone.",
      details: (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{expense.description || 'Untitled entry'}</p>
            <p className="text-xs text-slate font-mono">
              {format(new Date(expense.date), 'MMM d, yyyy')} · {CATEGORY_LABELS[expense.category] || expense.category}
            </p>
          </div>
          <span className="font-mono tabular text-sm font-semibold text-ink shrink-0">{money(expense.amount)}</span>
        </div>
      ),
      confirmLabel: 'Delete expense',
      busyLabel: 'Deleting…',
      tone: 'danger',
      onConfirm: () => deleteExpense(expense.id),
    });
    if (deleted) toast.success('Expense deleted', `${money(expense.amount)} · ${expense.description}`);
  };

  const handleBulkUpload = async (
    expensesData: Array<Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>>,
    onProgress?: (done: number, total: number) => void
  ) => {
    const expensesToAdd: Expense[] = expensesData.map((expense) => ({
      ...expense,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const total = expensesToAdd.length;
    const id = toast.loading(`Importing ${total.toLocaleString('en-IN')} expenses…`, `0 of ${total.toLocaleString('en-IN')}`);
    try {
      await addExpenses(expensesToAdd, (done, t) => {
        onProgress?.(done, t);
        toast.update(id, { description: `${done.toLocaleString('en-IN')} of ${t.toLocaleString('en-IN')}` });
      });
      toast.update(id, { kind: 'success', title: `Imported ${total.toLocaleString('en-IN')} expenses` });
      setShowBulkUpload(false);
    } catch (error) {
      toast.update(id, { kind: 'error', title: "Import didn't finish", description: errorMessage(error) });
      // Whatever landed before the failure is real data — show it.
      refreshExpenses().catch(() => undefined);
      throw error;
    }
  };

  const handleRestoreComplete = async () => {
    try {
      await Promise.all([refreshExpenses(), loadBudgets(), refreshSettings()]);
    } catch (error) {
      toast.error("Couldn't refresh after the restore", 'Reload the page to see everything.');
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    toast.loading('Signing out…');
    try {
      await signOut();
    } catch (error) {
      toast.error("Couldn't sign out", errorMessage(error));
    }
  };

  // ---- full-screen states ----------------------------------------------------
  if (settingsError || expensesError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-center p-8 card-surface max-w-lg">
          <h2 className="text-2xl font-display font-semibold text-ember mb-4">Couldn't open your ledger</h2>
          <p className="text-slate mb-6">{errorMessage(new Error(settingsError || expensesError || ''))}</p>
          <button onClick={() => window.location.reload()} className={btnPrimary}>
            Reload page
          </button>
        </div>
      </div>
    );
  }

  if (settingsLoading || expensesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto" />
          <p className="mt-4 text-sm text-slate font-mono">opening your ledger…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Thin progress bar while data is being re-synced (after an import or restore). */}
      <AnimatePresence>
        {refreshing && (
          <motion.div
            className="fixed top-0 inset-x-0 h-0.5 z-[70] overflow-hidden bg-pine/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="progressbar"
            aria-label="Refreshing your ledger"
          >
            <div className="h-full w-1/3 bg-pine loading-bar" />
          </motion.div>
        )}
      </AnimatePresence>

      <AppHeader
        currentView={currentView}
        onNavigate={setCurrentView}
        onAddExpense={() => openAddExpenseForm()}
        onImport={() => setShowBulkUpload(true)}
        onBackup={() => setShowBackupRestore(true)}
        onWhatsApp={() => setShowWhatsAppLink(true)}
        onExport={exportData}
        onExportSummary={exportSummary}
        onPdfReport={() => setShowPDFGenerator(true)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        onSignOut={handleSignOut}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {currentView === 'analytics' && <AnalyticsDashboard expenses={expenses} />}

            {currentView === 'dashboard' && (
              <DashboardView
                allExpenses={expenses}
                expenses={dashboardExpenses}
                period={dashboardPeriod}
                range={dashboardRange}
                onRangeChange={setDashboardRange}
                budgets={budgets}
                categoryStats={categoryStats}
                currency={currency}
                onAddExpense={() => openAddExpenseForm()}
                onEditExpense={handleEditExpense}
                onSelectCategory={setSelectedCategory}
                onOpenPdf={() => setShowPDFGenerator(true)}
                onOpenWalkthrough={() => setShowWalkthrough(true)}
                onGoToExpenses={() => setCurrentView('expenses')}
                onGoToBudgets={() => setCurrentView('budgets')}
              />
            )}

            {currentView === 'expenses' && (
              <>
                {expenses.length > 0 ? (
                  <div className="mb-8">
                    <ExpenseFilters filters={filters} onFilterChange={setFilters} />
                    <ExpenseList
                      expenses={filteredExpenses}
                      onEdit={handleEditExpense}
                      onDelete={requestDeleteExpense}
                      title={getExpenseListTitle()}
                      currency={currency}
                    />
                    {filteredExpenses.length === 0 && (
                      <div className="card-surface p-6 text-center">
                        <p className="text-sm text-slate">No expenses match your filters. Try adjusting your search criteria.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card-surface p-12 text-center">
                    <h2 className="text-xl font-display font-semibold text-ink mb-2">No expenses yet</h2>
                    <p className="text-sm text-slate mb-6">Start by adding your first expense or importing data in bulk.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                      <button onClick={() => openAddExpenseForm()} className={btnPrimary}>
                        Add expense
                      </button>
                      <button onClick={() => setShowBulkUpload(true)} className={btnSecondary}>
                        Import data
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {currentView === 'budgets' && (
              <BudgetsView currentSpending={currentMonthSpending} onBudgetsUpdate={loadBudgets} expenses={expenses} />
            )}

            {currentView === 'savings' && <SavingsTracker expenses={expenses} currency={currency} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {showExpenseForm && (
        <ExpenseForm
          expense={editingExpense || undefined}
          initialCategory={quickAddCategory}
          onSubmit={handleAddExpense}
          onCancel={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
            setQuickAddCategory(undefined);
          }}
        />
      )}

      {showBulkUpload && <BulkUpload onUpload={handleBulkUpload} onCancel={() => setShowBulkUpload(false)} />}

      {showBudgetManager && (
        <BudgetManager
          currentSpending={currentMonthSpending}
          onClose={() => {
            setShowBudgetManager(false);
            loadBudgets();
          }}
        />
      )}

      {showBackupRestore && (
        <BackupRestore onClose={() => setShowBackupRestore(false)} onRestoreComplete={handleRestoreComplete} />
      )}

      {showWhatsAppLink && <WhatsAppLink onClose={() => setShowWhatsAppLink(false)} />}

      {showPDFGenerator && (
        <PDFReportGenerator
          expenses={expenses}
          budgets={budgets}
          currency={currency}
          dashboardPeriod={dashboardPeriod}
          onShowDashboard={() => setCurrentView('dashboard')}
          onClose={() => setShowPDFGenerator(false)}
        />
      )}

      {/* Category Detail Modal — opened from any "Where it went" row: every
          entry behind that category's bar for the dashboard's current period. */}
      <AnimatePresence>
        {selectedCategory && (
          <CategoryExpensesModal
            category={selectedCategory}
            expenses={dashboardExpenses.filter((e) => e.category === selectedCategory)}
            periodTotal={totalExpenses}
            currency={currency}
            onClose={() => setSelectedCategory(null)}
            onEdit={handleEditExpense}
            onDelete={requestDeleteExpense}
            onAddNew={(category) => {
              setSelectedCategory(null);
              openAddExpenseForm(category);
            }}
          />
        )}
      </AnimatePresence>

      {/* Walkthrough — the dashboard's numbers as an explorable 3D hall. */}
      <AnimatePresence>
        {showWalkthrough && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-paper flex items-center justify-center">
                <div className="text-center">
                  <Spinner size="lg" className="mx-auto" />
                  <p className="mt-4 text-sm text-slate font-mono">building the hall…</p>
                </div>
              </div>
            }
          >
            <Walkthrough3D
              categoryStats={categoryStats.filter((s) => s.total > 0)}
              currency={currency}
              totalAmount={totalExpenses}
              totalEntries={dashboardExpenses.length}
              periodLabel={dashboardPeriod.label}
              onClose={() => setShowWalkthrough(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
