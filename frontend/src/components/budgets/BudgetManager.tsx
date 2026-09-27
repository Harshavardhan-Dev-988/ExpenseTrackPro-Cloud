import { useState, useEffect } from 'react';
import type { CategoryType, CategoryBudget } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
import { cloudApi as db } from '../../services/cloudApi';

interface BudgetManagerProps {
  currentSpending: Record<CategoryType, number>;
  onClose: () => void;
}

export default function BudgetManager({ currentSpending, onClose }: BudgetManagerProps) {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryType | null>(null);
  const [budgetType, setBudgetType] = useState<'monthly' | 'yearly'>('monthly');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');

  useEffect(() => {
    loadBudgets();
  }, []);

  const loadBudgets = async () => {
    try {
      const budgetsData = await db.getAllBudgets();
      setBudgets(budgetsData);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!editingCategory || !budgetLimit) return;

    setSaving(true);
    try {
      const budget: CategoryBudget = {
        category: editingCategory,
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
      setEditingCategory(null);
      setBudgetType('monthly');
      setBudgetLimit('');
      setAlertThreshold('80');
    } catch (error) {
      console.error('Failed to save budget:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async (category: CategoryType) => {
    try {
      await db.deleteBudget(category);
      await loadBudgets();
    } catch (error) {
      console.error('Failed to delete budget:', error);
    }
  };

  const handleEditBudget = (budget: CategoryBudget) => {
    setEditingCategory(budget.category);
    // Default to 'monthly' if budgetType is undefined (legacy budgets)
    const type = budget.budgetType || 'monthly';
    setBudgetType(type);
    const limitValue = type === 'yearly' 
      ? budget.yearlyLimit 
      : (budget.monthlyLimit || 0);
    setBudgetLimit(limitValue?.toString() || '');
    setAlertThreshold(budget.alertThreshold.toString());
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProgressColor = (spent: number, limit: number, threshold: number) => {
    const percentage = (spent / limit) * 100;
    if (percentage >= 100) return 'bg-ember';
    if (percentage >= threshold) return 'bg-brass';
    return 'bg-pine';
  };

  const categories = Object.keys(CATEGORY_LABELS) as CategoryType[];
  const ledgerInput = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-pine transition-colors';
  const ledgerLabel = 'block text-sm font-medium text-slate mb-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <div className="card-surface max-w-4xl w-full max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-paper [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-display text-2xl font-semibold text-ink">
              Budget Management
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate hover:text-ink hover:bg-paper rounded-md transition-colors"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
              <p className="mt-4 text-sm text-slate font-mono">loading budgets…</p>
            </div>
          ) : (
            <>
              {/* Active Budgets */}
              {budgets.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-display text-lg font-semibold text-ink mb-4">
                    Active Budgets
                  </h3>
                  <div className="space-y-4">
                    {budgets.map(budget => {
                      const spent = currentSpending[budget.category] || 0;
                      // Default to 'monthly' for legacy budgets without budgetType
                      const budgetTypeValue = budget.budgetType || 'monthly';
                      const limit = budgetTypeValue === 'monthly' ? (budget.monthlyLimit || 0) : (budget.yearlyLimit || 0);
                      const percentage = limit > 0 ? (spent / limit) * 100 : 0;

                      return (
                        <div
                          key={budget.category}
                          className="border border-line rounded-lg p-4"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-ink">
                                {CATEGORY_LABELS[budget.category] || budget.category}
                              </h4>
                              <p className="text-xs text-slate mt-0.5">
                                {budgetTypeValue === 'monthly' ? '📅 Monthly' : '📆 Yearly'}
                              </p>
                              <p className="text-sm text-slate mt-1 font-mono tabular">
                                {formatCurrency(spent)} / {formatCurrency(limit)}
                                <span className="ml-2">
                                  ({percentage.toFixed(1)}%)
                                </span>
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditBudget(budget)}
                                className="px-3 py-1 text-sm bg-pine/10 text-pine-strong dark:text-pine rounded hover:bg-pine/20 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteBudget(budget.category)}
                                className="px-3 py-1 text-sm bg-ember/10 text-ember-strong dark:text-ember rounded hover:bg-ember/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-line/60 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${getProgressColor(spent, limit, budget.alertThreshold)}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>

                          {/* Warning Message */}
                          {percentage >= 100 && (
                            <p className="text-sm text-ember-strong dark:text-ember mt-2">
                              Budget exceeded by {formatCurrency(spent - limit)}
                            </p>
                          )}
                          {percentage >= budget.alertThreshold && percentage < 100 && (
                            <p className="text-sm text-brass-strong dark:text-brass mt-2">
                              Approaching budget limit ({budget.alertThreshold}% threshold)
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add/Edit Budget Form */}
              <div className="border-t border-line pt-6">
                <h3 className="font-display text-lg font-semibold text-ink mb-4">
                  {editingCategory ? 'Edit Budget' : 'Add New Budget'}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className={ledgerLabel}>
                      Category
                    </label>
                    <select
                      value={editingCategory || ''}
                      onChange={(e) => setEditingCategory(e.target.value as CategoryType)}
                      className={ledgerInput}
                      disabled={saving}
                    >
                      <option value="">Select a category</option>
                      {categories.map(category => (
                        <option key={category} value={category}>
                          {CATEGORY_LABELS[category] || category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={ledgerLabel}>
                      Budget Type
                    </label>
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
                    <label className={ledgerLabel}>
                      {budgetType === 'monthly' ? 'Monthly' : 'Yearly'} Limit (₹)
                    </label>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      placeholder="Enter budget amount"
                      className={`${ledgerInput} font-mono tabular`}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className={ledgerLabel}>
                      Alert Threshold (%)
                    </label>
                    <input
                      type="number"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(e.target.value)}
                      placeholder="80"
                      min="0"
                      max="100"
                      className={`${ledgerInput} font-mono tabular`}
                      disabled={saving}
                    />
                    <p className="text-xs text-slate mt-1">
                      Get notified when spending reaches this percentage of the budget
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveBudget}
                      disabled={!editingCategory || !budgetLimit || saving}
                      className="flex-1 px-4 py-2.5 bg-pine text-paper rounded-lg hover:bg-pine-strong disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
                    >
                      {saving ? 'Saving...' : editingCategory ? 'Update Budget' : 'Add Budget'}
                    </button>
                    {editingCategory && (
                      <button
                        onClick={() => {
                          setEditingCategory(null);
                          setBudgetType('monthly');
                          setBudgetLimit('');
                          setAlertThreshold('80');
                        }}
                        className="px-4 py-2.5 border border-line text-ink rounded-lg hover:border-pine transition-colors font-medium text-sm"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
