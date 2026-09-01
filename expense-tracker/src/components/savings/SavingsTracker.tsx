import { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/db';
import { generateId, formatMoney } from '../../utils/helpers';
import { SAVINGS_CATEGORY_LABELS } from '../../utils/constants';
import type { SavingsEntry, SavingsGoal, SavingsCategory, Expense } from '../../types';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import StatTile from '../ui/StatTile';

interface SavingsTrackerProps {
  expenses: Expense[];
  currency?: string;
}

export default function SavingsTracker({ expenses, currency = 'INR' }: SavingsTrackerProps) {
  const formatCurrency = (amount: number) => formatMoney(amount, currency);
  const [savings, setSavings] = useState<SavingsEntry[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [showAddSavings, setShowAddSavings] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [dateRange, setDateRange] = useState<'all' | 'month' | 'year'>('all');
  
  // Form states
  const [savingsForm, setSavingsForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    category: 'general_savings' as SavingsCategory,
    description: '',
    account: '',
    interestRate: '',
  });

  const [goalForm, setGoalForm] = useState({
    name: '',
    targetAmount: '',
    category: 'general_savings' as SavingsCategory,
    deadline: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
  });

  useEffect(() => {
    loadSavings();
    loadGoals();
  }, []);

  const loadSavings = async () => {
    try {
      const data = await db.getAllSavings();
      setSavings(data);
    } catch (error) {
      console.error('Failed to load savings:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const data = await db.getAllSavingsGoals();
      setSavingsGoals(data);
    } catch (error) {
      console.error('Failed to load savings goals:', error);
    }
  };

  const handleAddSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newSavings: SavingsEntry = {
      id: generateId(),
      date: new Date(savingsForm.date),
      amount: parseFloat(savingsForm.amount),
      category: savingsForm.category,
      description: savingsForm.description,
      account: savingsForm.account || undefined,
      interestRate: savingsForm.interestRate ? parseFloat(savingsForm.interestRate) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await db.addSavings(newSavings);
      await loadSavings();
      setShowAddSavings(false);
      setSavingsForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        category: 'general_savings',
        description: '',
        account: '',
        interestRate: '',
      });
    } catch (error) {
      console.error('Failed to add savings:', error);
      alert('Failed to add savings');
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newGoal: SavingsGoal = {
      id: generateId(),
      name: goalForm.name,
      targetAmount: parseFloat(goalForm.targetAmount),
      currentAmount: 0,
      category: goalForm.category,
      deadline: goalForm.deadline ? new Date(goalForm.deadline) : undefined,
      priority: goalForm.priority,
      isActive: true,
      createdAt: new Date(),
    };

    try {
      await db.addSavingsGoal(newGoal);
      await loadGoals();
      setShowAddGoal(false);
      setGoalForm({
        name: '',
        targetAmount: '',
        category: 'general_savings',
        deadline: '',
        priority: 'medium',
      });
    } catch (error) {
      console.error('Failed to add goal:', error);
      alert('Failed to add savings goal');
    }
  };

  const handleDeleteSavings = async (id: string) => {
    if (confirm('Are you sure you want to delete this savings entry?')) {
      try {
        await db.deleteSavings(id);
        await loadSavings();
      } catch (error) {
        console.error('Failed to delete savings:', error);
      }
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (confirm('Are you sure you want to delete this savings goal?')) {
      try {
        await db.deleteSavingsGoal(id);
        await loadGoals();
      } catch (error) {
        console.error('Failed to delete goal:', error);
      }
    }
  };

  // Filter savings by date range
  const filteredSavings = useMemo(() => {
    if (dateRange === 'all') return savings;
    
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (dateRange === 'month') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else {
      startDate = startOfYear(now);
      endDate = endOfYear(now);
    }

    return savings.filter(s => {
      const date = new Date(s.date);
      return date >= startDate && date <= endDate;
    });
  }, [savings, dateRange]);

  // Calculate insights
  const insights = useMemo(() => {
    const totalSavings = filteredSavings.reduce((sum, s) => sum + s.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const savingsRate = totalExpenses > 0 ? (totalSavings / (totalSavings + totalExpenses)) * 100 : 0;
    
    // Category breakdown
    const categoryBreakdown = filteredSavings.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + s.amount;
      return acc;
    }, {} as Record<SavingsCategory, number>);

    // Monthly average
    const monthlyAvg = filteredSavings.length > 0 
      ? totalSavings / Math.max(1, new Set(filteredSavings.map(s => format(new Date(s.date), 'yyyy-MM'))).size)
      : 0;

    return {
      totalSavings,
      totalExpenses,
      savingsRate,
      categoryBreakdown,
      monthlyAvg,
      netCashFlow: totalSavings - totalExpenses,
    };
  }, [filteredSavings, expenses]);

  const ledgerInput = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink focus:outline-none focus:border-pine transition-colors';
  const ledgerLabel = 'block text-xs font-medium text-slate mb-1.5';

  return (
    <div className="space-y-6">
      {/* Header with action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Savings Tracker</h2>
          <p className="text-sm text-slate">Track your savings and achieve your financial goals</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddSavings(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Savings
          </button>
          <button
            onClick={() => setShowAddGoal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Add Goal
          </button>
        </div>
      </div>

      {/* Date range selector */}
      <div className="flex gap-1.5 bg-surface rounded-lg p-1.5 border border-line w-fit">
        <button
          onClick={() => setDateRange('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            dateRange === 'all'
              ? 'bg-pine text-paper'
              : 'text-slate hover:bg-paper hover:text-ink'
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setDateRange('month')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            dateRange === 'month'
              ? 'bg-pine text-paper'
              : 'text-slate hover:bg-paper hover:text-ink'
          }`}
        >
          This Month
        </button>
        <button
          onClick={() => setDateRange('year')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            dateRange === 'year'
              ? 'bg-pine text-paper'
              : 'text-slate hover:bg-paper hover:text-ink'
          }`}
        >
          This Year
        </button>
      </div>

      {/* Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon="◆"
          label="Total Savings"
          value={formatCurrency(insights.totalSavings)}
          tone="brass"
        />
        <StatTile
          icon="%"
          label="Savings Rate"
          value={`${insights.savingsRate.toFixed(1)}%`}
          tone="pine"
        />
        <StatTile
          icon="Σ"
          label="Monthly Average"
          value={formatCurrency(insights.monthlyAvg)}
          tone="brass"
        />
        <StatTile
          icon={insights.netCashFlow >= 0 ? '↑' : '↓'}
          label="Net Cash Flow"
          value={formatCurrency(Math.abs(insights.netCashFlow))}
          sublabel={insights.netCashFlow >= 0 ? 'Surplus' : 'Deficit'}
          tone={insights.netCashFlow >= 0 ? 'pine' : 'ember'}
        />
      </div>

      {/* Savings Goals */}
      {savingsGoals.length > 0 && (
        <div className="card-surface p-6">
          <h3 className="font-display text-lg font-semibold text-ink mb-4 flex items-center gap-2">
            <span className="text-brass" aria-hidden="true">◆</span>
            Savings Goals
          </h3>
          <div className="space-y-3">
            {savingsGoals.map(goal => {
              const progress = (goal.currentAmount / goal.targetAmount) * 100;
              const isGoalComplete = progress >= 100;
              return (
                <div key={goal.id} className="p-4 bg-paper border border-line rounded-lg">
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div>
                      <h4 className="font-semibold text-ink">{goal.name}</h4>
                      <p className="text-sm text-slate">{SAVINGS_CATEGORY_LABELS[goal.category]}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-ink font-mono tabular">
                        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                      </p>
                      {isGoalComplete ? (
                        <span
                          key={`${goal.id}-complete`}
                          className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-pine/10 text-pine-strong dark:text-pine text-[11px] font-medium animate-stamp-in"
                        >
                          <span aria-hidden="true">✓</span> Goal reached
                        </span>
                      ) : (
                        <p className="text-sm text-slate font-mono tabular">{progress.toFixed(1)}%</p>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-line/60 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isGoalComplete ? 'bg-pine' : 'bg-brass'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[11px] font-mono font-medium px-2 py-1 rounded ${
                      goal.priority === 'critical' ? 'bg-ember/10 text-ember-strong dark:text-ember' :
                      goal.priority === 'high' ? 'bg-brass/10 text-brass-strong dark:text-brass' :
                      goal.priority === 'medium' ? 'bg-line/60 text-ink' :
                      'bg-line/60 text-slate'
                    }`}>
                      {goal.priority.toUpperCase()}
                    </span>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-slate hover:text-ember-strong dark:hover:text-ember text-sm transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Savings List */}
      <div className="card-surface p-6">
        <h3 className="font-display text-lg font-semibold text-ink mb-4">Recent Savings</h3>
        {filteredSavings.length === 0 ? (
          <p className="text-slate text-center py-8">No savings entries yet. Start tracking your savings!</p>
        ) : (
          <div className="space-y-2">
            {filteredSavings
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(saving => (
                <div
                  key={saving.id}
                  className="flex items-center justify-between p-3 bg-paper border border-line rounded-lg hover:border-pine/40 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{saving.description}</span>
                      <span className="text-xs px-2 py-0.5 bg-brass/10 text-brass-strong dark:text-brass rounded-full font-mono">
                        {SAVINGS_CATEGORY_LABELS[saving.category]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate font-mono tabular">
                      <span>📅 {format(new Date(saving.date), 'MMM dd, yyyy')}</span>
                      {saving.account && <span>🏦 {saving.account}</span>}
                      {saving.interestRate && <span>📈 {saving.interestRate}% interest</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold font-mono tabular text-brass-strong dark:text-brass">
                      +{formatCurrency(saving.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteSavings(saving.id)}
                      className="p-2 text-slate hover:text-ember-strong dark:hover:text-ember hover:bg-line/40 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Add Savings Modal */}
      {showAddSavings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="card-surface p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-xl font-semibold text-ink mb-4">Add Savings Entry</h3>
            <form onSubmit={handleAddSavings} className="space-y-4">
              <div>
                <label className={ledgerLabel}>Date</label>
                <input
                  type="date"
                  required
                  value={savingsForm.date}
                  onChange={e => setSavingsForm({ ...savingsForm, date: e.target.value })}
                  className={ledgerInput}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Amount (₹)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={savingsForm.amount}
                  onChange={e => setSavingsForm({ ...savingsForm, amount: e.target.value })}
                  className={`${ledgerInput} font-mono tabular`}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Category</label>
                <select
                  required
                  value={savingsForm.category}
                  onChange={e => setSavingsForm({ ...savingsForm, category: e.target.value as SavingsCategory })}
                  className={ledgerInput}
                >
                  {Object.entries(SAVINGS_CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ledgerLabel}>Description</label>
                <input
                  type="text"
                  required
                  value={savingsForm.description}
                  onChange={e => setSavingsForm({ ...savingsForm, description: e.target.value })}
                  className={ledgerInput}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Account (Optional)</label>
                <input
                  type="text"
                  value={savingsForm.account}
                  onChange={e => setSavingsForm({ ...savingsForm, account: e.target.value })}
                  placeholder="e.g., SBI FD, HDFC Savings"
                  className={ledgerInput}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Interest Rate % (Optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={savingsForm.interestRate}
                  onChange={e => setSavingsForm({ ...savingsForm, interestRate: e.target.value })}
                  className={`${ledgerInput} font-mono tabular`}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong active:scale-[0.98] transition-all duration-200"
                >
                  Add Savings
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSavings(false)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="card-surface p-6 max-w-md w-full">
            <h3 className="font-display text-xl font-semibold text-ink mb-4">Add Savings Goal</h3>
            <form onSubmit={handleAddGoal} className="space-y-4">
              <div>
                <label className={ledgerLabel}>Goal Name</label>
                <input
                  type="text"
                  required
                  value={goalForm.name}
                  onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                  placeholder="e.g., Emergency Fund, New Car"
                  className={ledgerInput}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Target Amount (₹)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={goalForm.targetAmount}
                  onChange={e => setGoalForm({ ...goalForm, targetAmount: e.target.value })}
                  className={`${ledgerInput} font-mono tabular`}
                />
              </div>
              <div>
                <label className={ledgerLabel}>Category</label>
                <select
                  required
                  value={goalForm.category}
                  onChange={e => setGoalForm({ ...goalForm, category: e.target.value as SavingsCategory })}
                  className={ledgerInput}
                >
                  {Object.entries(SAVINGS_CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ledgerLabel}>Priority</label>
                <select
                  required
                  value={goalForm.priority}
                  onChange={e => setGoalForm({ ...goalForm, priority: e.target.value as any })}
                  className={ledgerInput}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className={ledgerLabel}>Deadline (Optional)</label>
                <input
                  type="date"
                  value={goalForm.deadline}
                  onChange={e => setGoalForm({ ...goalForm, deadline: e.target.value })}
                  className={ledgerInput}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong active:scale-[0.98] transition-all duration-200"
                >
                  Add Goal
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddGoal(false)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
