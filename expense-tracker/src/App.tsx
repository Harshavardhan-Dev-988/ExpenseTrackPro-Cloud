import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExpenses } from './hooks/useExpenses';
import { useSettings } from './hooks/useSettings';
import { useAnalytics } from './hooks/useAnalytics';
import ExpenseForm from './components/forms/ExpenseForm';
import ExpenseList from './components/expenses/ExpenseList';
import ExpenseFilters from './components/expenses/ExpenseFilters';
import PaymentMethodChart from './components/charts/PaymentMethodChart';
import CategoryPieChart from './components/charts/CategoryPieChart';
import DailyExpensesChart from './components/charts/DailyExpensesChart';
import WeekdaySpendingChart from './components/charts/WeekdaySpendingChart';
import LedgerLineChart from './components/charts/LedgerLineChart';
import CategoryBreakdown from './components/dashboard/CategoryBreakdown';
import RecentActivity from './components/dashboard/RecentActivity';
import StatTile from './components/ui/StatTile';
import CountUp from './components/ui/CountUp';
import BulkUpload from './components/forms/BulkUpload';
import ExportMenu from './components/export/ExportMenu';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import BudgetManager from './components/budgets/BudgetManager';
import BudgetAlerts from './components/budgets/BudgetAlerts';
import BudgetsView from './components/budgets/BudgetsView';
import BackupRestore from './components/backup/BackupRestore';
import PDFReportGenerator from './components/reports/PDFReportGenerator';
import SavingsTracker from './components/savings/SavingsTracker';
import { generateId, formatMoney } from './utils/helpers';
import { db } from './services/db';
import { CATEGORY_LABELS } from './utils/constants';
import type { Expense, CategoryType, PaymentMethod, CategoryBudget } from './types';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns';

type View = 'dashboard' | 'expenses' | 'budgets' | 'savings' | 'analytics';

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'savings', label: 'Savings' },
  { key: 'analytics', label: 'Reports' },
];

const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap';

function App() {
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showBudgetManager, setShowBudgetManager] = useState(false);
  const [showBackupRestore, setShowBackupRestore] = useState(false);
  const [showPDFGenerator, setShowPDFGenerator] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [justRecorded, setJustRecorded] = useState<{ amount: number; description: string } | null>(null);
  const [dashboardDateRange, setDashboardDateRange] = useState<{
    type: 'all' | 'month' | 'year' | 'today' | 'custom';
    startDate?: string;
    endDate?: string;
    month?: string; // Format: YYYY-MM
    year?: string; // Format: YYYY
  }>({
    type: 'all',
  });
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

  // Load budgets
  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      const budgetsData = await db.getAllBudgets();
      setBudgets(budgetsData);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    }
  };

  const { settings, loading: settingsLoading, error: settingsError, updateSettings } = useSettings();
  const { expenses, loading: expensesLoading, error: expensesError, addExpense, addExpenses, updateExpense, deleteExpense } = useExpenses();

  // Resolve 'system' to an actual light/dark reading so the toggle button
  // shows (and switches away from) whatever is currently on screen, even
  // on a first run where no explicit preference has been saved yet.
  const prefersDarkSystem = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDarkMode = settings.theme === 'dark' || (settings.theme === 'system' && prefersDarkSystem);
  const toggleTheme = () => updateSettings({ theme: isDarkMode ? 'light' : 'dark' });

  // Calculate current month spending by category for budget alerts
  const currentMonthSpending = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    return expenses
      .filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      })
      .reduce((acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
      }, {} as Record<CategoryType, number>);
  }, [expenses]);

  // Generate dynamic title for expense list based on active filters
  const getExpenseListTitle = () => {
    const filterParts: string[] = [];

    if (filters.searchText) {
      filterParts.push(`"${filters.searchText}"`);
    }

    if (filters.categories.length > 0) {
      if (filters.categories.length === 1) {
        filterParts.push(CATEGORY_LABELS[filters.categories[0]] || filters.categories[0]);
      } else if (filters.categories.length <= 3) {
        filterParts.push(filters.categories.map(cat => CATEGORY_LABELS[cat] || cat).join(', '));
      } else {
        filterParts.push(`${filters.categories.length} Categories`);
      }
    }

    if (filters.paymentMethods.length > 0) {
      if (filters.paymentMethods.length === 1) {
        const methodMap: Record<PaymentMethod, string> = {
          cash: 'Cash',
          card: 'Card',
          upi: 'UPI',
          netbanking: 'Net Banking',
          cheque: 'Cheque',
          other: 'Other'
        };
        filterParts.push(methodMap[filters.paymentMethods[0]]);
      } else {
        filterParts.push(`${filters.paymentMethods.length} Payment Methods`);
      }
    }

    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom && filters.dateTo) {
        filterParts.push(`${format(new Date(filters.dateFrom), 'MMM dd, yyyy')} - ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`);
      } else if (filters.dateFrom) {
        filterParts.push(`From ${format(new Date(filters.dateFrom), 'MMM dd, yyyy')}`);
      } else if (filters.dateTo) {
        filterParts.push(`Until ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`);
      }
    }

    if (filters.minAmount || filters.maxAmount) {
      if (filters.minAmount && filters.maxAmount) {
        filterParts.push(`₹${filters.minAmount} - ₹${filters.maxAmount}`);
      } else if (filters.minAmount) {
        filterParts.push(`≥ ₹${filters.minAmount}`);
      } else if (filters.maxAmount) {
        filterParts.push(`≤ ₹${filters.maxAmount}`);
      }
    }

    if (filterParts.length === 0) {
      return 'Recent Expenses';
    }

    return `Expenses: ${filterParts.join(' • ')}`;
  };

  // Filter expenses based on current filters
  const filteredExpenses = expenses.filter(expense => {
    if (filters.searchText && !expense.description.toLowerCase().includes(filters.searchText.toLowerCase())) {
      return false;
    }
    if (filters.categories.length > 0 && !filters.categories.includes(expense.category)) {
      return false;
    }
    if (filters.paymentMethods.length > 0 && !filters.paymentMethods.includes(expense.paymentMethod || 'cash')) {
      return false;
    }
    if (filters.dateFrom && new Date(expense.date) < new Date(filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo && new Date(expense.date) > new Date(filters.dateTo)) {
      return false;
    }
    if (filters.minAmount && expense.amount < parseFloat(filters.minAmount)) {
      return false;
    }
    if (filters.maxAmount && expense.amount > parseFloat(filters.maxAmount)) {
      return false;
    }
    return true;
  });

  // Filter expenses for dashboard based on date range
  const dashboardExpenses = useMemo(() => {
    const now = new Date();

    switch (dashboardDateRange.type) {
      case 'today': {
        const today = format(now, 'yyyy-MM-dd');
        return expenses.filter(e => format(new Date(e.date), 'yyyy-MM-dd') === today);
      }
      case 'month': {
        if (dashboardDateRange.month) {
          const [year, month] = dashboardDateRange.month.split('-');
          const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
          const monthEnd = endOfMonth(monthStart);
          return expenses.filter(e => {
            const expDate = new Date(e.date);
            return expDate >= monthStart && expDate <= monthEnd;
          });
        }
        const currentMonthStart = startOfMonth(now);
        const currentMonthEnd = endOfMonth(now);
        return expenses.filter(e => {
          const expDate = new Date(e.date);
          return expDate >= currentMonthStart && expDate <= currentMonthEnd;
        });
      }
      case 'year': {
        if (dashboardDateRange.year) {
          const yearStart = new Date(parseInt(dashboardDateRange.year), 0, 1);
          const yearEnd = endOfYear(yearStart);
          return expenses.filter(e => {
            const expDate = new Date(e.date);
            return expDate >= yearStart && expDate <= yearEnd;
          });
        }
        const currentYearStart = startOfYear(now);
        const currentYearEnd = endOfYear(now);
        return expenses.filter(e => {
          const expDate = new Date(e.date);
          return expDate >= currentYearStart && expDate <= currentYearEnd;
        });
      }
      case 'custom':
        return expenses.filter(e => {
          const expDate = new Date(e.date);
          const matchesStart = !dashboardDateRange.startDate || expDate >= new Date(dashboardDateRange.startDate);
          const matchesEnd = !dashboardDateRange.endDate || expDate <= new Date(dashboardDateRange.endDate);
          return matchesStart && matchesEnd;
        });
      case 'all':
      default:
        return expenses;
    }
  }, [expenses, dashboardDateRange]);

  // Get display text for current dashboard date range
  const getDashboardDateRangeText = () => {
    const now = new Date();
    switch (dashboardDateRange.type) {
      case 'today':
        return `Today (${format(now, 'MMM dd, yyyy')})`;
      case 'month': {
        if (dashboardDateRange.month) {
          const [year, month] = dashboardDateRange.month.split('-');
          return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM yyyy');
        }
        return format(now, 'MMMM yyyy');
      }
      case 'year':
        return dashboardDateRange.year || now.getFullYear().toString();
      case 'custom': {
        const parts = [];
        if (dashboardDateRange.startDate) {
          parts.push(`From ${format(new Date(dashboardDateRange.startDate), 'MMM dd, yyyy')}`);
        }
        if (dashboardDateRange.endDate) {
          parts.push(`To ${format(new Date(dashboardDateRange.endDate), 'MMM dd, yyyy')}`);
        }
        return parts.length > 0 ? parts.join(' • ') : 'Custom Range';
      }
      case 'all':
      default:
        return 'All Time';
    }
  };

  // Get simplified label for budget alert context
  const getBudgetDateRangeLabel = () => {
    const now = new Date();
    switch (dashboardDateRange.type) {
      case 'today':
        return 'today';
      case 'month': {
        if (dashboardDateRange.month) {
          const [year, month] = dashboardDateRange.month.split('-');
          return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMMM yyyy');
        }
        return 'this month';
      }
      case 'year':
        return `year ${dashboardDateRange.year || now.getFullYear()}`;
      case 'custom':
        return 'the selected period';
      case 'all':
      default:
        return 'all time';
    }
  };

  const { totalExpenses, averageExpense, topCategories, categoryStats } = useAnalytics(dashboardExpenses);

  // Daily series for the signature ledger-line chart in the dashboard hero.
  const dailySeries = useMemo(() => {
    const byDay = new Map<string, number>();
    dashboardExpenses.forEach((e) => {
      const key = format(new Date(e.date), 'yyyy-MM-dd');
      byDay.set(key, (byDay.get(key) || 0) + e.amount);
    });
    return Array.from(byDay.entries())
      .map(([key, value]) => ({ date: new Date(key), value }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [dashboardExpenses]);

  const recordedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddExpense = async (expenseData: {
    date: Date;
    amount: number;
    category: any;
    description: string;
    paymentMethod?: any;
    tags?: string[];
  }) => {
    const wasEditing = !!editingExpense;
    if (editingExpense) {
      await updateExpense({
        ...editingExpense,
        ...expenseData,
        updatedAt: new Date(),
      });
      setEditingExpense(null);
    } else {
      await addExpense(expenseData);
    }
    setShowExpenseForm(false);

    // A quiet "entry recorded" moment instead of a generic toast — the
    // ledger acknowledging the line that was just written.
    if (!wasEditing) {
      if (recordedTimer.current) clearTimeout(recordedTimer.current);
      setJustRecorded({ amount: expenseData.amount, description: expenseData.description });
      recordedTimer.current = setTimeout(() => setJustRecorded(null), 2600);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setShowExpenseForm(true);
  };

  const handleBulkUpload = async (expensesData: Array<any>) => {
    const expensesToAdd: Expense[] = expensesData.map(expense => ({
      ...expense,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (addExpenses) {
      await addExpenses(expensesToAdd);
    }
    setShowBulkUpload(false);
  };

  if (settingsError || expensesError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-center p-8 card-surface max-w-lg">
          <h2 className="text-2xl font-display font-semibold text-ember mb-4">Couldn't open your ledger</h2>
          <p className="text-slate mb-6">{settingsError || expensesError}</p>
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
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
          <p className="mt-4 text-sm text-slate font-mono">opening your ledger…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header */}
      <header className="bg-paper/90 backdrop-blur-md border-b border-line sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-3">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pine flex items-center justify-center shrink-0">
                <span className="text-lg font-display font-semibold text-paper">₹</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-display font-semibold text-ink leading-tight">
                  ExpenseTrack Pro
                </h1>
                <p className="text-xs text-slate font-mono uppercase tracking-wide">Your household ledger</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-2.5">
              <button onClick={() => setShowExpenseForm(true)} className={btnPrimary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add expense
              </button>
              <button onClick={() => setShowBulkUpload(true)} className={btnSecondary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import
              </button>
              <button onClick={() => setShowBackupRestore(true)} className={btnSecondary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Backup
              </button>
              <ExportMenu
                expenses={expenses}
                budgets={budgets}
                totalExpenses={totalExpenses}
                averageExpense={averageExpense}
                categoryStats={categoryStats}
                onPDFExport={() => setShowPDFGenerator(true)}
              />
              <button
                onClick={toggleTheme}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-line bg-surface text-ink hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 shrink-0"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.36-6.36l-1.06 1.06M6.7 17.3l-1.06 1.06m12.72 0l-1.06-1.06M6.7 6.7L5.64 5.64M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* View switcher — underline tabs with a sliding indicator */}
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px" aria-label="Sections">
            {NAV_ITEMS.map((item) => {
              const active = currentView === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCurrentView(item.key)}
                  className={`relative px-3.5 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                    active ? 'text-ink' : 'text-slate hover:text-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute left-0 right-0 -bottom-px h-0.5 bg-pine rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
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
          <>
            {(() => {
              const categorySpending = dashboardExpenses.reduce((acc, expense) => {
                acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
                return acc;
              }, {} as Record<CategoryType, number>);

              const hasAlerts = budgets.some(budget => {
                if (!budget.isActive) return false;
                const spent = categorySpending[budget.category] || 0;
                const budgetTypeValue = budget.budgetType || 'monthly';
                const limit = budgetTypeValue === 'monthly' ? (budget.monthlyLimit || 0) : (budget.yearlyLimit || 0);
                const percentage = limit > 0 ? (spent / limit) * 100 : 0;
                return percentage >= budget.alertThreshold;
              });

              return hasAlerts ? (
                <div className="mb-5">
                  <BudgetAlerts
                    budgets={budgets}
                    expenses={dashboardExpenses}
                    onManageBudgets={() => setCurrentView('budgets')}
                    dateRangeType={dashboardDateRange.type}
                    dateRangeLabel={getBudgetDateRangeLabel()}
                    showOnlyAlerts={true}
                  />
                </div>
              ) : null;
            })()}

            {/* Date range selector — a sliding pill (same spring-underline
                language as the section tabs above) instead of an instant
                color swap, so picking a range feels like one continuous
                motion rather than a flat state change. */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
                {(['all', 'today', 'month', 'year', 'custom'] as const).map((type) => {
                  const active = dashboardDateRange.type === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setDashboardDateRange({ type })}
                      className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 ${
                        active ? 'text-paper' : 'text-slate hover:text-ink hover:bg-line/50'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="date-range-pill"
                          className="absolute inset-0 bg-pine rounded-md"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <span className="relative z-10">{type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                    </button>
                  );
                })}
              </div>

              {dashboardDateRange.type === 'month' && (
                <Fragment key="month-selector">
                  <input
                    type="month"
                    value={dashboardDateRange.month || format(new Date(), 'yyyy-MM')}
                    onChange={(e) => setDashboardDateRange({ type: 'month', month: e.target.value })}
                    className="px-2.5 py-1.5 text-xs border border-line rounded-md bg-surface text-ink focus:outline-none"
                  />
                </Fragment>
              )}

              {dashboardDateRange.type === 'year' && (
                <Fragment key="year-selector">
                  <select
                    value={dashboardDateRange.year || new Date().getFullYear().toString()}
                    onChange={(e) => setDashboardDateRange({ type: 'year', year: e.target.value })}
                    className="px-2.5 py-1.5 text-xs border border-line rounded-md bg-surface text-ink focus:outline-none relative z-10"
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </Fragment>
              )}

              {dashboardDateRange.type === 'custom' && (
                <Fragment key="custom-selector">
                  <input
                    type="date"
                    value={dashboardDateRange.startDate || ''}
                    onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, type: 'custom', startDate: e.target.value })}
                    className="px-2.5 py-1.5 text-xs border border-line rounded-md bg-surface text-ink focus:outline-none"
                  />
                  <span className="text-xs text-slate">to</span>
                  <input
                    type="date"
                    value={dashboardDateRange.endDate || ''}
                    onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, type: 'custom', endDate: e.target.value })}
                    className="px-2.5 py-1.5 text-xs border border-line rounded-md bg-surface text-ink focus:outline-none"
                  />
                </Fragment>
              )}

              <span className="ml-auto text-xs font-mono text-slate">
                {getDashboardDateRangeText()} · {dashboardExpenses.length} entr{dashboardExpenses.length !== 1 ? 'ies' : 'y'}
              </span>
            </div>

            {dashboardExpenses.length === 0 ? (
              <div className="card-surface border-dashed p-12 text-center mb-8">
                <h3 className="text-lg font-display font-semibold text-ink mb-2">No entries yet</h3>
                <p className="text-sm text-slate mb-5 max-w-sm mx-auto">
                  {dashboardDateRange.type === 'all'
                    ? "Your ledger is empty — add your first expense to start the line."
                    : `Nothing recorded for ${getDashboardDateRangeText()}. Try a different period.`}
                </p>
                {dashboardDateRange.type !== 'all' ? (
                  <button onClick={() => setDashboardDateRange({ type: 'all' })} className={btnPrimary}>
                    View all time
                  </button>
                ) : (
                  <button onClick={() => setShowExpenseForm(true)} className={btnPrimary}>
                    Add your first expense
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Hero: ledger summary + signature trend line */}
                <motion.section
                  className="card-surface relative overflow-hidden p-5 sm:p-7 mb-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="aura aura-pine" aria-hidden="true" />
                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate font-mono mb-1">Total, {getDashboardDateRangeText()}</p>
                      <p className="font-display text-4xl sm:text-5xl font-semibold text-ink tabular">
                        <CountUp value={totalExpenses} formatter={(n) => formatMoney(n, settings.currency)} />
                      </p>
                    </div>
                    <div className="flex gap-6 sm:gap-8">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate font-mono mb-1">Entries</p>
                        <p className="font-mono tabular text-xl font-semibold text-ink">{dashboardExpenses.length}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate font-mono mb-1">Average</p>
                        <p className="font-mono tabular text-xl font-semibold text-ink">{formatMoney(averageExpense, settings.currency)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10">
                    <LedgerLineChart
                      data={dailySeries}
                      currency={settings.currency}
                      accent="pine"
                      ariaLabel={`Daily spending trend for ${getDashboardDateRangeText()}, drawn as a single hand-inked line`}
                    />
                  </div>
                </motion.section>

                {/* Where it went + Recent activity */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
                  <motion.section
                    className="lg:col-span-2 card-surface p-5 sm:p-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h2 className="font-display text-lg font-semibold text-ink mb-4">Where it went</h2>
                    <CategoryBreakdown stats={categoryStats.filter(s => s.total > 0)} total={totalExpenses} currency={settings.currency} />
                  </motion.section>

                  <motion.section
                    className="lg:col-span-3 card-surface p-5 sm:p-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h2 className="font-display text-lg font-semibold text-ink mb-4">Recent activity</h2>
                    <RecentActivity
                      expenses={dashboardExpenses}
                      currency={settings.currency}
                      onEdit={handleEditExpense}
                      onViewAll={() => setCurrentView('expenses')}
                    />
                  </motion.section>
                </div>

                {/* Quick insights */}
                {(() => {
                  const sortedByAmount = [...dashboardExpenses].sort((a, b) => b.amount - a.amount);
                  const largestExpense = sortedByAmount[0];

                  const dayOfWeekSpending = dashboardExpenses.reduce((acc, exp) => {
                    const day = new Date(exp.date).getDay();
                    acc[day] = (acc[day] || 0) + exp.amount;
                    return acc;
                  }, {} as Record<number, number>);
                  const maxDaySpending = Math.max(...Object.values(dayOfWeekSpending));
                  const maxDay = Object.entries(dayOfWeekSpending).find(([, amount]) => amount === maxDaySpending);
                  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

                  const sortedByDate = [...dashboardExpenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const firstDate = sortedByDate.length > 0 ? new Date(sortedByDate[0].date) : new Date();
                  const today = new Date();
                  const daysDiff = Math.max(1, Math.ceil((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                  const dailyBurnRate = totalExpenses / daysDiff;
                  const avgPerTransaction = dashboardExpenses.length > 0 ? totalExpenses / dashboardExpenses.length : 0;

                  const activeBudgets = budgets.filter(b => b.isActive);
                  let budgetHealth = 100;
                  if (activeBudgets.length > 0) {
                    const categorySpending = dashboardExpenses.reduce((acc, exp) => {
                      acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
                      return acc;
                    }, {} as Record<string, number>);

                    const exceededCount = activeBudgets.filter(budget => {
                      const spent = categorySpending[budget.category] || 0;
                      const limit = budget.budgetType === 'yearly' ? budget.yearlyLimit : budget.monthlyLimit;
                      return limit && spent > limit;
                    }).length;

                    budgetHealth = Math.round(((activeBudgets.length - exceededCount) / activeBudgets.length) * 100);
                  }

                  return (
                    <section className="mb-6">
                      <h2 className="font-display text-lg font-semibold text-ink mb-4">Quick insights</h2>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <StatTile
                          icon="🔥"
                          label="Daily burn"
                          value={formatMoney(dailyBurnRate, settings.currency)}
                          sublabel={`Since ${format(firstDate, 'MMM d')}`}
                          delay={0}
                        />
                        <StatTile
                          icon="💳"
                          label="Per entry"
                          value={formatMoney(avgPerTransaction, settings.currency)}
                          sublabel={`${dashboardExpenses.length} entries`}
                          delay={0.05}
                        />
                        <StatTile
                          icon="◆"
                          label="Largest"
                          value={formatMoney(largestExpense.amount, settings.currency)}
                          sublabel={<span className="truncate block">{largestExpense.description}</span>}
                          tone="brass"
                          delay={0.1}
                        />
                        {maxDay ? (
                          <StatTile
                            icon="📅"
                            label="Busiest day"
                            value={dayNames[parseInt(maxDay[0])]}
                            sublabel={formatMoney(Number(maxDay[1]), settings.currency)}
                            delay={0.15}
                          />
                        ) : activeBudgets.length > 0 ? (
                          <StatTile
                            icon={budgetHealth >= 80 ? '✓' : budgetHealth >= 60 ? '!' : '⚠'}
                            label="Budget health"
                            value={`${budgetHealth}%`}
                            sublabel={`${activeBudgets.length} active budget${activeBudgets.length !== 1 ? 's' : ''}`}
                            tone={budgetHealth >= 80 ? 'pine' : budgetHealth >= 60 ? 'brass' : 'ember'}
                            delay={0.15}
                          />
                        ) : null}
                      </div>
                    </section>
                  );
                })()}

                {/* Category distribution + payment mix — two compact, complementary reads on the same period's spending. lg:items-stretch makes both grid columns share the row's full height (the taller pie chart sets it); the right column stacks the payment chart with a weekday breakdown that grows to fill whatever's left, so the two columns' bottom edges always land in the same place instead of one trailing off short. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 lg:items-stretch">
                  <motion.div
                    className="h-full"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <CategoryPieChart categoryStats={categoryStats.filter(s => s.total > 0)} currency={settings.currency} compact />
                  </motion.div>
                  <div className="h-full flex flex-col gap-6">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <PaymentMethodChart expenses={dashboardExpenses} currency={settings.currency} compact />
                    </motion.div>
                    <motion.div
                      className="flex-1 min-h-[160px]"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <WeekdaySpendingChart expenses={dashboardExpenses} currency={settings.currency} compact fillHeight />
                    </motion.div>
                  </div>
                </div>

                {/* Daily expenses — the bar-by-bar view, with its own month picker */}
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <DailyExpensesChart expenses={expenses} />
                </motion.div>
              </>
            )}
          </>
        )}

        {/* Expenses View */}
        {currentView === 'expenses' && (
          <>
            {expenses.length > 0 ? (
              <div className="mb-8">
                <ExpenseFilters filters={filters} onFilterChange={setFilters} />
                <ExpenseList
                  expenses={filteredExpenses}
                  onEdit={handleEditExpense}
                  onDelete={deleteExpense}
                  title={getExpenseListTitle()}
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
                  <button onClick={() => setShowExpenseForm(true)} className={btnPrimary}>Add expense</button>
                  <button onClick={() => setShowBulkUpload(true)} className={btnSecondary}>Import data</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Budgets View */}
        {currentView === 'budgets' && (
          <BudgetsView currentSpending={currentMonthSpending} onBudgetsUpdate={loadBudgets} expenses={expenses} />
        )}

        {/* Savings View */}
        {currentView === 'savings' && <SavingsTracker expenses={expenses} currency={settings.currency} />}
      </motion.div>
      </AnimatePresence>
      </main>

      {/* Expense recorded confirmation — a quiet stamp, not a toast */}
      <AnimatePresence>
        {justRecorded && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-5 right-5 z-50 card-surface px-4 py-3 flex items-center gap-3 max-w-xs"
          >
            <span className="w-8 h-8 rounded-full bg-pine/10 text-pine-strong flex items-center justify-center text-sm font-semibold shrink-0">✓</span>
            <span className="text-sm">
              <span className="block font-medium text-ink">Entry recorded</span>
              <span className="block text-xs text-slate truncate">
                {formatMoney(justRecorded.amount, settings.currency)} · {justRecorded.description}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <ExpenseForm
          expense={editingExpense || undefined}
          onSubmit={handleAddExpense}
          onCancel={() => {
            setShowExpenseForm(false);
            setEditingExpense(null);
          }}
        />
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <BulkUpload onUpload={handleBulkUpload} onCancel={() => setShowBulkUpload(false)} />
      )}

      {/* Budget Manager Modal */}
      {showBudgetManager && (
        <BudgetManager
          currentSpending={currentMonthSpending}
          onClose={() => {
            setShowBudgetManager(false);
            loadBudgets();
          }}
        />
      )}

      {/* Backup/Restore Modal */}
      {showBackupRestore && (
        <BackupRestore
          onClose={() => setShowBackupRestore(false)}
          onRestoreComplete={() => window.location.reload()}
        />
      )}

      {/* PDF Report Generator Modal */}
      {showPDFGenerator && (
        <PDFReportGenerator expenses={expenses} budgets={budgets} onClose={() => setShowPDFGenerator(false)} />
      )}
    </div>
  );
}

export default App;
