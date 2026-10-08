import { useMemo, useState, useEffect, memo } from 'react';
import type { CategoryBudget, Expense } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
import { formatMoney } from '../../utils/helpers';

interface BudgetAlertsProps {
  budgets: CategoryBudget[];
  expenses: Expense[];
  onManageBudgets: () => void;
  dateRangeType?: 'all' | 'month' | 'year' | 'today' | 'custom';
  dateRangeLabel?: string;
  persistSuccessMessage?: boolean; // Don't auto-hide in Budgets tab
  showOnlyAlerts?: boolean; // Only show when there are actual alerts (for Dashboard)
}

function BudgetAlerts({ budgets, expenses, onManageBudgets, dateRangeType = 'month', dateRangeLabel = 'this month', persistSuccessMessage = false, showOnlyAlerts = false }: BudgetAlertsProps) {
  const [showSuccessMessage, setShowSuccessMessage] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const alerts = useMemo(() => {

    // Calculate spending by category for provided expenses
    const spending = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as Record<string, number>);


    // Check each budget
    const allAlerts = budgets
      .filter(budget => budget.isActive)
      .map(budget => {
        const spent = spending[budget.category] || 0;
        // Get the appropriate limit based on budget type (default to monthly for legacy budgets)
        const budgetTypeValue = budget.budgetType || 'monthly';
        const limit = budgetTypeValue === 'monthly' 
          ? (budget.monthlyLimit || 0) 
          : (budget.yearlyLimit || 0);
        const percentage = limit > 0 ? (spent / limit) * 100 : 0;
        
        return {
          budget,
          spent,
          limit,
          percentage,
          status:
            percentage >= 100
              ? 'exceeded'
              : percentage >= budget.alertThreshold
              ? 'warning'
              : 'ok',
        };
      });

    console.log('BudgetAlerts: All budget statuses:', allAlerts.map(a => ({
      category: a.budget.category,
      spent: a.spent,
      limit: a.limit,
      percentage: a.percentage.toFixed(1) + '%',
      status: a.status
    })));

    const filteredAlerts = allAlerts
      .filter(alert => alert.status !== 'ok')
      .sort((a, b) => b.percentage - a.percentage);


    return filteredAlerts;
  }, [budgets, expenses, dateRangeType, dateRangeLabel]);

  // Reset dismissed alerts when date range changes
  useEffect(() => {
    setDismissedAlerts(false);
    setIsVisible(true);
    setIsFadingOut(false);
  }, [dateRangeType, dateRangeLabel]);

  // Auto-dismiss alerts after 3 seconds on dashboard (when showOnlyAlerts is true)
  useEffect(() => {
    if (showOnlyAlerts && alerts.length > 0) {
      // Start fade-out at 2.5 seconds
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, 2500);

      // Completely hide at 3 seconds
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        setDismissedAlerts(true);
      }, 3000);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [showOnlyAlerts, alerts.length, dateRangeType, dateRangeLabel]);

  const formatCurrency = (value: number) => formatMoney(value, 'INR');

  // Auto-hide success message after 5 seconds (only if not persistent)
  useEffect(() => {
    if (budgets.length > 0 && alerts.length === 0 && !persistSuccessMessage) {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000); // Hide after 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [budgets.length, alerts.length, persistSuccessMessage]);

  // If showOnlyAlerts is true and there are no alerts, don't render anything
  if (showOnlyAlerts && alerts.length === 0) {
    return null;
  }

  // Show positive message if no alerts but budgets exist (with auto-hide unless persistent)
  if (budgets.length > 0 && alerts.length === 0 && showSuccessMessage) {
    return (
      <div className="mb-6 fade-in">
        <div className="card-surface p-5 border-l-4 border-l-pine">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <span className="text-pine-strong dark:text-pine text-xl" aria-hidden="true">✓</span>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-ink text-base">All budgets on track</h3>
                <p className="text-sm text-slate mt-1">You're within every limit you've set for {dateRangeLabel}.</p>
                {persistSuccessMessage && budgets.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {budgets.map(budget => (
                      <div key={budget.category} className="text-xs bg-paper rounded-lg p-2 border border-line font-mono">
                        <div className="font-semibold text-ink">{CATEGORY_LABELS[budget.category] || budget.category}</div>
                        <div className="text-slate mt-0.5">₹0 spent · 0% used</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {!persistSuccessMessage && (
              <button
                onClick={() => setShowSuccessMessage(false)}
                className="text-slate hover:text-ink transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (alerts.length === 0 || dismissedAlerts || !isVisible) return null;

  const exceededCount = alerts.filter((a) => a.status === 'exceeded').length;
  const warningCount = alerts.filter((a) => a.status === 'warning').length;

  return (
    <div className={`space-y-2 transition-opacity duration-500 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
      {/* Compact Summary Banner */}
      <div className={`card-surface p-3 border-l-4 ${exceededCount > 0 ? 'border-l-ember' : 'border-l-brass'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1">
            <span className={`text-lg ${exceededCount > 0 ? 'text-ember' : 'text-brass'}`} aria-hidden="true">{exceededCount > 0 ? '⚠' : '!'}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">
                {exceededCount > 0
                  ? `${exceededCount} budget${exceededCount !== 1 ? 's' : ''} over limit`
                  : `${warningCount} budget${warningCount !== 1 ? 's' : ''} running close`}
                <span className="text-slate font-normal"> · {dateRangeLabel}</span>
              </p>
              <p className="text-xs text-slate">
                {exceededCount > 0 ? "You've gone past the limit — worth a look." : 'Approaching the limit you set.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onManageBudgets}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                exceededCount > 0 ? 'bg-ember/10 text-ember-strong dark:text-ember hover:bg-ember/20' : 'bg-brass/10 text-brass-strong dark:text-brass hover:bg-brass/20'
              }`}
            >
              Manage →
            </button>
            <button
              onClick={() => setDismissedAlerts(true)}
              className="p-1 text-slate hover:text-ink transition-colors"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Detailed Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {alerts.map(({ budget, spent, limit, percentage, status }) => (
          <div key={budget.category} className="card-surface p-3">
            <div className="flex justify-between items-start mb-1.5">
              <h4 className="text-sm font-medium text-ink">{CATEGORY_LABELS[budget.category] || budget.category || 'Unknown'}</h4>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-mono ${
                status === 'exceeded' ? 'bg-ember/10 text-ember-strong dark:text-ember' : 'bg-brass/10 text-brass-strong dark:text-brass'
              }`}>
                {percentage.toFixed(0)}%
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-mono tabular text-slate">
                {formatCurrency(spent)} / {formatCurrency(limit)}
              </p>

              <div className="w-full bg-line/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${status === 'exceeded' ? 'bg-ember' : 'bg-brass'}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>

              {status === 'exceeded' && (
                <p className="text-xs text-ember-strong dark:text-ember">Over by {formatCurrency(spent - limit)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders when props haven't changed
export default memo(BudgetAlerts);
