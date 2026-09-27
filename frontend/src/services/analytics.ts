import type { Expense, CategoryType, CategoryStats, TrendData } from '../types';
import { groupExpensesByCategory, groupExpensesByMonth } from '../utils/helpers';

export class AnalyticsService {
  calculateCategoryStats(expenses: Expense[], category: CategoryType): CategoryStats {
    const categoryExpenses = expenses.filter(e => e.category === category);
    const amounts = categoryExpenses.map(e => e.amount);

    if (amounts.length === 0) {
      return {
        category,
        total: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0,
        stdDev: 0,
        count: 0,
      };
    }

    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const average = total / amounts.length;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    
    // Calculate median
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // Calculate standard deviation
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    return {
      category,
      total,
      average,
      min,
      max,
      median,
      stdDev,
      count: amounts.length,
    };
  }

  calculateAllCategoryStats(expenses: Expense[]): CategoryStats[] {
    const grouped = groupExpensesByCategory(expenses);
    return Object.keys(grouped).map(category => 
      this.calculateCategoryStats(expenses, category as CategoryType)
    );
  }

  calculateMonthlyTotals(expenses: Expense[]): Record<string, number> {
    const grouped = groupExpensesByMonth(expenses);
    return Object.entries(grouped).reduce((acc, [month, exps]) => {
      acc[month] = exps.reduce((sum, exp) => sum + exp.amount, 0);
      return acc;
    }, {} as Record<string, number>);
  }

  calculateYoYComparison(expenses: Expense[], month: number) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2];
    
    return years.map(year => {
      const yearExpenses = expenses.filter(e => {
        const date = new Date(e.date);
        return date.getFullYear() === year && date.getMonth() === month;
      });
      
      const total = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
      return { year, total };
    });
  }

  detectAnomalies(expenses: Expense[]): Expense[] {
    const grouped = groupExpensesByCategory(expenses);
    const anomalies: Expense[] = [];

    Object.entries(grouped).forEach(([category, categoryExpenses]) => {
      const stats = this.calculateCategoryStats(expenses, category as CategoryType);
      const threshold = stats.average + (2 * stats.stdDev);

      categoryExpenses.forEach(expense => {
        if (expense.amount > threshold) {
          anomalies.push(expense);
        }
      });
    });

    return anomalies;
  }

  calculateTrend(expenses: Expense[], days: number = 30): TrendData[] {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const relevantExpenses = expenses.filter(e => new Date(e.date) >= startDate);
    const dailyTotals: Record<string, number> = {};

    relevantExpenses.forEach(expense => {
      const dateKey = new Date(expense.date).toISOString().split('T')[0];
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + expense.amount;
    });

    return Object.entries(dailyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, actual]) => ({ date, actual }));
  }
}

export const analyticsService = new AnalyticsService();
