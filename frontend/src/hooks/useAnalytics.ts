import { useMemo } from 'react';
import type { Expense, CategoryStats } from '../types';
import { analyticsService } from '../services/analytics';

export const useAnalytics = (expenses: Expense[]) => {
  const categoryStats = useMemo(
    () => analyticsService.calculateAllCategoryStats(expenses),
    [expenses]
  );

  const monthlyTotals = useMemo(
    () => analyticsService.calculateMonthlyTotals(expenses),
    [expenses]
  );

  const anomalies = useMemo(
    () => analyticsService.detectAnomalies(expenses),
    [expenses]
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );

  const averageExpense = useMemo(
    () => expenses.length > 0 ? totalExpenses / expenses.length : 0,
    [totalExpenses, expenses.length]
  );

  const topCategories = useMemo(() => {
    return [...categoryStats]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [categoryStats]);

  const trend = useMemo(
    () => analyticsService.calculateTrend(expenses, 30),
    [expenses]
  );

  return {
    categoryStats,
    monthlyTotals,
    anomalies,
    totalExpenses,
    averageExpense,
    topCategories,
    trend,
  };
};
