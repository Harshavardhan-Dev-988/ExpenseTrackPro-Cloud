import { useState, useEffect, useMemo } from 'react';
import type { CategoryType, CategoryBudget, Expense } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
import { formatMoney } from '../../utils/helpers';
import { cloudApi as db } from '../../services/cloudApi';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import BudgetAlerts from './BudgetAlerts';
import { useToast, errorMessage } from '../ui/toastContext';
import { useConfirm } from '../ui/confirmContext';

interface BudgetsViewProps {
  currentSpending: Record<CategoryType, number>;
  onBudgetsUpdate: () => void;
  expenses: Expense[];
}

export default function BudgetsView({ onBudgetsUpdate, expenses }: BudgetsViewProps) {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudget | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | ''>('');
  const [budgetType, setBudgetType] = useState<'monthly' | 'yearly'>('monthly');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');
  
  // Filter state for viewing budgets
  const [viewPeriod, setViewPeriod] = useState<'month' | 'year'>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(format(new Date(), 'yyyy'));
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      const budgetsData = await db.getAllBudgets();

      // Migrate legacy budgets without budgetType
      const migratedBudgets = budgetsData.map(budget => {
        if (!budget.budgetType) {
          // If budget has monthlyLimit, it's a monthly budget
          // Otherwise default to monthly
          return {
            ...budget,
            budgetType: 'monthly' as 'monthly' | 'yearly',
            monthlyLimit: budget.monthlyLimit || 0,
          };
        }
        return budget;
      });
      
      // Save migrated budgets if any were updated
      const needsMigration = budgetsData.some(b => !b.budgetType);
      if (needsMigration) {
        for (const budget of migratedBudgets) {
          if (!budgetsData.find(b => b.category === budget.category && b.budgetType)) {
            await db.saveBudget(budget);
          }
        }
      }
      
      setBudgets(migratedBudgets);
      onBudgetsUpdate();
    } catch (error) {
      console.error('Failed to load budgets:', error);
      toast.error("Couldn't load your budgets", errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!selectedCategory || !budgetLimit) return;

    setSaving(true);
    try {
      const budget: CategoryBudget = {
        category: selectedCategory as CategoryType,
        budgetType,
        ...(budgetType === 'monthly' 
          ? { monthlyLimit: parseFloat(budgetLimit) }
          : { yearlyLimit: parseFloat(budgetLimit) }
        ),
        alertThreshold: parseFloat(alertThreshold),
        isActive: true,
      };

      await db.saveBudget(budget);
      await loadBudgets();
      toast.success(
        editingBudget ? 'Budget updated' : 'Budget saved',
        `${CATEGORY_LABELS[budget.category] || budget.category} · ${formatMoney(
          (budget.budgetType === 'yearly' ? budget.yearlyLimit : budget.monthlyLimit) || 0,
          'INR'
        )} ${budget.budgetType === 'yearly' ? 'a year' : 'a month'}`
      );
      resetForm();
    } catch (error) {
      console.error('Failed to save budget:', error);
      toast.error("Couldn't save that budget", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (category: CategoryType) => {
    const label = CATEGORY_LABELS[category] || category;
    const deleted = await confirm({
      title: `Delete the ${label} budget?`,
      message: 'Your expenses stay as they are — only the spending limit and its alerts are removed.',
      confirmLabel: 'Delete budget',
      busyLabel: 'Deleting…',
      tone: 'danger',
      onConfirm: async () => {
        await db.deleteBudget(category);
        await loadBudgets();
      },
    });
    if (deleted) toast.success('Budget deleted', label);
  };

  const handleEditBudget = (budget: CategoryBudget) => {
    setEditingBudget(budget);
    setSelectedCategory(budget.category);
    // Default to 'monthly' if budgetType is undefined (legacy budgets)
    setBudgetType(budget.budgetType || 'monthly');
    const limitValue = budget.budgetType === 'yearly' 
      ? budget.yearlyLimit 
      : (budget.monthlyLimit || 0);
    setBudgetLimit(limitValue?.toString() || '');
    setAlertThreshold(budget.alertThreshold.toString());
    setShowAddForm(true);
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingBudget(null);
    setSelectedCategory('');
    setBudgetType('monthly');
    setBudgetLimit('');
    setAlertThreshold('80');
  };

  const formatCurrency = (value: number) => formatMoney(value, 'INR');

  const getProgressColor = (spent: number, limit: number, threshold: number) => {
    const percentage = (spent / limit) * 100;
    if (percentage >= 100) return 'bg-ember';
    if (percentage >= threshold) return 'bg-brass';
    return 'bg-pine';
  };

  const getStatusBadge = (spent: number, limit: number, threshold: number) => {
    const percentage = (spent / limit) * 100;
    if (percentage >= 100) {
      return <span className="px-2 py-0.5 text-[11px] font-medium bg-ember/10 text-ember-strong dark:text-ember rounded-full">Over budget</span>;
    }
    if (percentage >= threshold) {
      return <span className="px-2 py-0.5 text-[11px] font-medium bg-brass/10 text-brass-strong dark:text-brass rounded-full">Watching</span>;
    }
    return <span className="px-2 py-0.5 text-[11px] font-medium bg-pine/10 text-pine-strong dark:text-pine rounded-full">On track</span>;
  };

  // Calculate spending for the selected period
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    if (viewPeriod === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = startOfMonth(new Date(year, month - 1, 1));
      const end = endOfMonth(new Date(year, month - 1, 1));
      return expenses.filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= start && expenseDate <= end;
      });
    } else {
      const year = parseInt(selectedYear);
      const start = startOfYear(new Date(year, 0, 1));
      const end = endOfYear(new Date(year, 0, 1));
      return expenses.filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= start && expenseDate <= end;
      });
    }
  }, [expenses, viewPeriod, selectedMonth, selectedYear]);

  const periodSpending = useMemo(() => {
    return filteredExpenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as Record<CategoryType, number>);
  }, [filteredExpenses]);

  const categories = Object.keys(CATEGORY_LABELS) as CategoryType[];
  const availableCategories = categories.filter(
    cat => !budgets.find(b => b.category === cat) || cat === selectedCategory
  );

  const getDateRangeLabel = () => {
    if (viewPeriod === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      return format(new Date(year, month - 1, 1), 'MMMM yyyy');
    } else {
      return `Year ${selectedYear}`;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
        <p className="mt-4 text-sm text-slate font-mono">loading budgets…</p>
      </div>
    );
  }

  const ledgerInput = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-pine transition-colors';
  const ledgerLabel = 'block text-xs font-medium text-slate mb-1.5';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Budgets</h2>
          <p className="mt-0.5 text-sm text-slate">Set a limit per category and watch how close you're running.</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong transition-colors"
          >
            + New budget
          </button>
        )}
      </div>

      {/* Period Filter */}
      <div className="card-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono uppercase tracking-wide text-slate">Viewing</span>
          <select
            value={viewPeriod}
            onChange={(e) => setViewPeriod(e.target.value as 'month' | 'year')}
            className="px-3 py-1.5 bg-paper border border-line rounded-md text-sm text-ink focus:outline-none focus:border-pine"
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>

          {viewPeriod === 'month' ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 bg-paper border border-line rounded-md text-sm text-ink focus:outline-none focus:border-pine"
            />
          ) : (
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              min="2020"
              max="2030"
              className="px-3 py-1.5 bg-paper border border-line rounded-md text-sm text-ink w-28 focus:outline-none focus:border-pine"
            />
          )}

          <span className="px-2.5 py-1 bg-pine/10 text-pine-strong dark:text-pine rounded-full font-medium text-xs font-mono">
            {getDateRangeLabel()}
          </span>
        </div>
      </div>

      {/* Add/Edit Budget Form */}
      {showAddForm && (
        <div className="card-surface p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg font-semibold text-ink">
              {editingBudget ? 'Edit budget' : 'New budget'}
            </h3>
            <button onClick={resetForm} className="text-slate hover:text-ink transition-colors">✕</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={ledgerLabel}>Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryType)}
                className={ledgerInput}
                disabled={saving}
              >
                <option value="">Select category…</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={ledgerLabel}>Budget type</label>
              <select
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value as 'monthly' | 'yearly')}
                className={ledgerInput}
                disabled={saving}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className={ledgerLabel}>{budgetType === 'monthly' ? 'Monthly' : 'Yearly'} limit (₹)</label>
              <input
                type="number"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder={budgetType === 'monthly' ? 'e.g., 10000' : 'e.g., 120000'}
                min="0"
                step="100"
                className={`${ledgerInput} font-mono tabular`}
                disabled={saving}
              />
            </div>

            <div>
              <label className={ledgerLabel}>Alert threshold (%)</label>
              <input
                type="number"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                min="0"
                max="100"
                step="5"
                className={`${ledgerInput} font-mono tabular`}
                disabled={saving}
              />
              <p className="text-xs text-slate mt-1">Warn at {alertThreshold}% of limit</p>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSaveBudget}
              disabled={!selectedCategory || !budgetLimit || saving}
              className="px-5 py-2.5 bg-pine text-paper rounded-lg hover:bg-pine-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
            >
              {saving ? 'Saving…' : editingBudget ? 'Update budget' : 'Save budget'}
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              className="px-5 py-2.5 border border-line text-ink rounded-lg hover:border-pine transition-colors font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Budgets */}
      {budgets.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink">
              {viewPeriod === 'month' ? 'Monthly' : 'Yearly'} budgets ({budgets.filter(b => (b.budgetType || 'monthly') === (viewPeriod === 'month' ? 'monthly' : 'yearly')).length})
            </h3>
            <p className="text-xs text-slate">
              {budgets.filter(b => (b.budgetType || 'monthly') !== (viewPeriod === 'month' ? 'monthly' : 'yearly')).length > 0 && (
                <span>({budgets.filter(b => (b.budgetType || 'monthly') !== (viewPeriod === 'month' ? 'monthly' : 'yearly')).length} {viewPeriod === 'month' ? 'yearly' : 'monthly'} budget{budgets.filter(b => (b.budgetType || 'monthly') !== (viewPeriod === 'month' ? 'monthly' : 'yearly')).length !== 1 ? 's' : ''} hidden)</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map(budget => {
              // Calculate spending based on budget type and view period
              let spent = 0;
              let limit = 0;
              let shouldDisplay = false;
              
              // Default to 'monthly' for legacy budgets without budgetType
              const budgetTypeValue = budget.budgetType || 'monthly';
              
              if (budgetTypeValue === 'monthly') {
                limit = budget.monthlyLimit || 0;
                // Show monthly budgets when viewing month
                if (viewPeriod === 'month') {
                  spent = periodSpending[budget.category] || 0;
                  shouldDisplay = true;
                }
              } else if (budgetTypeValue === 'yearly') {
                limit = budget.yearlyLimit || 0;
                // Show yearly budgets when viewing year
                if (viewPeriod === 'year') {
                  spent = periodSpending[budget.category] || 0;
                  shouldDisplay = true;
                }
              }
              
              if (!shouldDisplay) return null;
              
              const percentage = limit > 0 ? (spent / limit) * 100 : 0;
              const remaining = limit - spent;

              return (
                <div key={budget.category} className="card-surface p-5">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h4 className="font-display font-semibold text-ink text-base">
                        {CATEGORY_LABELS[budget.category] || budget.category || 'Unknown'}
                      </h4>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-line/60 text-slate font-mono">
                          {(budget.budgetType || 'monthly') === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                        {getStatusBadge(spent, limit, budget.alertThreshold)}
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => handleEditBudget(budget)}
                        className="w-8 h-8 flex items-center justify-center text-slate hover:text-pine hover:bg-paper rounded-md transition-colors"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(budget.category)}
                        className="w-8 h-8 flex items-center justify-center text-slate hover:text-ember hover:bg-paper rounded-md transition-colors"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Spending Info */}
                  <div className="space-y-1.5 mb-3 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate">Spent</span>
                      <span className="font-semibold text-ink tabular">{formatCurrency(spent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate">Limit</span>
                      <span className="text-ink tabular">{formatCurrency(limit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate">Remaining</span>
                      <span className={`font-semibold tabular ${remaining >= 0 ? 'text-pine-strong dark:text-pine' : 'text-ember-strong dark:text-ember'}`}>
                        {formatCurrency(Math.abs(remaining))} {remaining < 0 && 'over'}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-line/60 rounded-full h-2.5 overflow-hidden mb-1.5">
                    <div
                      className={`h-full transition-all duration-500 ${getProgressColor(spent, limit, budget.alertThreshold)}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate font-mono text-right">{percentage.toFixed(0)}% used</p>

                  {/* Warning Messages */}
                  {percentage >= 100 && (
                    <div className="mt-3 p-2 bg-ember/10 rounded-md text-xs text-ember-strong dark:text-ember">
                      Over by {formatCurrency(spent - limit)}
                    </div>
                  )}
                  {percentage >= budget.alertThreshold && percentage < 100 && (
                    <div className="mt-3 p-2 bg-brass/10 rounded-md text-xs text-brass-strong dark:text-brass">
                      {(100 - percentage).toFixed(0)}% remaining
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        !showAddForm && (
          <div className="card-surface border-dashed p-12 text-center">
            <h3 className="font-display text-xl font-semibold text-ink mb-2">No budgets yet</h3>
            <p className="text-sm text-slate mb-6">Set a limit on any category to start tracking against it.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong transition-colors"
            >
              + Create your first budget
            </button>
          </div>
        )
      )}

      {/* Tips */}
      <div className="card-surface p-4 text-sm">
        <h4 className="font-medium text-ink mb-2 flex items-center gap-1.5">
          <span className="text-brass" aria-hidden="true">◆</span> A few tips
        </h4>
        <ul className="space-y-1 text-slate list-disc list-inside marker:text-line">
          <li>Set realistic monthly or yearly limits based on income and typical spend</li>
          <li>The alert threshold gives you warning before you go over</li>
          <li>Switch the period filter to check budgets for a different month or year</li>
          <li>Anything approaching its limit also shows up on the Dashboard</li>
        </ul>
      </div>

      {/* Budget Alerts Section */}
      {budgets.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-semibold text-ink mb-4">
            Alerts — {getDateRangeLabel()}
          </h3>
          <BudgetAlerts
            budgets={budgets.filter(b => {
              const budgetTypeValue = b.budgetType || 'monthly';
              return viewPeriod === 'month' ? budgetTypeValue === 'monthly' : budgetTypeValue === 'yearly';
            })}
            expenses={filteredExpenses}
            onManageBudgets={() => {}}
            dateRangeType={viewPeriod === 'month' ? 'month' : 'year'}
            dateRangeLabel={getDateRangeLabel()}
            persistSuccessMessage={true}
          />
        </div>
      )}
    </div>
  );
}
