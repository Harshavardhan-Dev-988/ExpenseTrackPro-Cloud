import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subYears,
  differenceInMonths,
  differenceInYears,
  isSameMonth,
  isSameYear,
  parseISO,
} from 'date-fns';
import type { Expense, CategoryType } from '../types';

// ============================================================================
// INTERFACES
// ============================================================================

export interface YoYComparison {
  currentYear: number;
  previousYear: number;
  categories: {
    category: CategoryType;
    currentYearTotal: number;
    previousYearTotal: number;
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  }[];
  overall: {
    currentYearTotal: number;
    previousYearTotal: number;
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface MoMComparison {
  months: {
    month: string; // 'YYYY-MM'
    total: number;
    change: number;
    changePercent: number;
    trend: 'up' | 'down' | 'stable';
  }[];
  avgMonthlySpend: number;
  highestMonth: { month: string; total: number };
  lowestMonth: { month: string; total: number };
}

export interface TrendAnalysis {
  movingAverage7Day: { date: Date; value: number }[];
  movingAverage30Day: { date: Date; value: number }[];
  linearRegression: {
    slope: number;
    intercept: number;
    rSquared: number;
  };
  predictions: { date: Date; predicted: number; confidence: [number, number] }[];
  trendDirection: 'increasing' | 'decreasing' | 'stable';
}

export interface AnomalyDetection {
  anomalies: {
    expense: Expense;
    zScore: number;
    categoryAvg: number;
    categoryStdDev: number;
    severity: 'low' | 'medium' | 'high';
  }[];
  threshold: number;
}

export interface StatisticalSummary {
  category: CategoryType;
  count: number;
  total: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number; // First quartile
  q3: number; // Third quartile
}

export interface DateRangeComparison {
  range1: {
    startDate: Date;
    endDate: Date;
    total: number;
    avgDaily: number;
    count: number;
  };
  range2: {
    startDate: Date;
    endDate: Date;
    total: number;
    avgDaily: number;
    count: number;
  };
  comparison: {
    totalChange: number;
    totalChangePercent: number;
    avgDailyChange: number;
    countChange: number;
  };
}

// ============================================================================
// YEAR-OVER-YEAR COMPARISON
// ============================================================================

export function calculateYoY(expenses: Expense[], targetYear?: number): YoYComparison {
  const year = targetYear || new Date().getFullYear();
  const prevYear = year - 1;

  // Filter expenses by year
  const currentYearExpenses = expenses.filter(e => 
    isSameYear(new Date(e.date), new Date(year, 0, 1))
  );
  const previousYearExpenses = expenses.filter(e => 
    isSameYear(new Date(e.date), new Date(prevYear, 0, 1))
  );

  // Calculate by category
  const categories = new Set<CategoryType>();
  [...currentYearExpenses, ...previousYearExpenses].forEach(e => categories.add(e.category));

  const categoryComparisons = Array.from(categories).map(category => {
    const currentYearTotal = currentYearExpenses
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);

    const previousYearTotal = previousYearExpenses
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);

    const change = currentYearTotal - previousYearTotal;
    const changePercent = previousYearTotal > 0 ? (change / previousYearTotal) * 100 : 0;
    const trend = Math.abs(changePercent) < 5 ? 'stable' : change > 0 ? 'up' : 'down';

    return {
      category,
      currentYearTotal,
      previousYearTotal,
      change,
      changePercent,
      trend,
    };
  });

  // Calculate overall
  const currentYearTotal = currentYearExpenses.reduce((sum, e) => sum + e.amount, 0);
  const previousYearTotal = previousYearExpenses.reduce((sum, e) => sum + e.amount, 0);
  const overallChange = currentYearTotal - previousYearTotal;
  const overallChangePercent = previousYearTotal > 0 ? (overallChange / previousYearTotal) * 100 : 0;
  const overallTrend = Math.abs(overallChangePercent) < 5 ? 'stable' : overallChange > 0 ? 'up' : 'down';

  return {
    currentYear: year,
    previousYear: prevYear,
    categories: categoryComparisons,
    overall: {
      currentYearTotal,
      previousYearTotal,
      change: overallChange,
      changePercent: overallChangePercent,
      trend: overallTrend,
    },
  };
}

// ============================================================================
// MONTH-OVER-MONTH COMPARISON
// ============================================================================

export function calculateMoM(expenses: Expense[], monthsCount: number = 12): MoMComparison {
  const now = new Date();
  const months: { month: string; total: number }[] = [];

  // Generate last N months
  for (let i = monthsCount - 1; i >= 0; i--) {
    const targetDate = subMonths(now, i);
    const monthKey = format(targetDate, 'yyyy-MM');
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);

    const monthTotal = expenses
      .filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    months.push({ month: monthKey, total: monthTotal });
  }

  // Calculate month-over-month changes
  const monthsWithChanges = months.map((month, index) => {
    if (index === 0) {
      return {
        ...month,
        change: 0,
        changePercent: 0,
        trend: 'stable' as const,
      };
    }

    const prevMonth = months[index - 1];
    const change = month.total - prevMonth.total;
    const changePercent = prevMonth.total > 0 ? (change / prevMonth.total) * 100 : 0;
    const trend = Math.abs(changePercent) < 5 ? 'stable' : change > 0 ? 'up' : 'down';

    return {
      ...month,
      change,
      changePercent,
      trend: trend as 'up' | 'down' | 'stable',
    };
  });

  // Calculate statistics
  const avgMonthlySpend = months.reduce((sum, m) => sum + m.total, 0) / months.length;
  const sortedMonths = [...months].sort((a, b) => b.total - a.total);
  const highestMonth = sortedMonths[0] || { month: '', total: 0 };
  const lowestMonth = sortedMonths[sortedMonths.length - 1] || { month: '', total: 0 };

  return {
    months: monthsWithChanges,
    avgMonthlySpend,
    highestMonth,
    lowestMonth,
  };
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

export function calculateTrend(expenses: Expense[]): TrendAnalysis {
  // Sort expenses by date
  const sortedExpenses = [...expenses].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate moving averages
  const movingAverage7Day = calculateMovingAverage(sortedExpenses, 7);
  const movingAverage30Day = calculateMovingAverage(sortedExpenses, 30);

  // Linear regression
  const regression = calculateLinearRegression(sortedExpenses);

  // Generate predictions (next 30 days)
  const predictions = generatePredictions(sortedExpenses, regression, 30);

  // Determine trend direction
  const trendDirection = regression.slope > 0.5 ? 'increasing' : 
                        regression.slope < -0.5 ? 'decreasing' : 'stable';

  return {
    movingAverage7Day,
    movingAverage30Day,
    linearRegression: regression,
    predictions,
    trendDirection,
  };
}

function calculateMovingAverage(expenses: Expense[], windowDays: number): { date: Date; value: number }[] {
  if (expenses.length === 0) return [];

  const dailyTotals = new Map<string, number>();
  
  // Aggregate by day
  expenses.forEach(e => {
    const dateKey = format(new Date(e.date), 'yyyy-MM-dd');
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + e.amount);
  });

  // Convert to sorted array
  const dailyArray = Array.from(dailyTotals.entries())
    .map(([date, total]) => ({ date: new Date(date), total }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate moving average
  const result: { date: Date; value: number }[] = [];
  for (let i = 0; i < dailyArray.length; i++) {
    const start = Math.max(0, i - windowDays + 1);
    const window = dailyArray.slice(start, i + 1);
    const avg = window.reduce((sum, d) => sum + d.total, 0) / window.length;
    result.push({ date: dailyArray[i].date, value: avg });
  }

  return result;
}

function calculateLinearRegression(expenses: Expense[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  if (expenses.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const baseTime = new Date(expenses[0].date).getTime();
  const points = expenses.map(e => ({
    x: (new Date(e.date).getTime() - baseTime) / (1000 * 60 * 60 * 24), // Days since first expense
    y: e.amount,
  }));

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
  const ssResidual = points.reduce((sum, p) => {
    const predicted = slope * p.x + intercept;
    return sum + Math.pow(p.y - predicted, 2);
  }, 0);
  const rSquared = 1 - (ssResidual / ssTotal);

  return { slope, intercept, rSquared };
}

function generatePredictions(
  expenses: Expense[],
  regression: { slope: number; intercept: number; rSquared: number },
  daysAhead: number
): { date: Date; predicted: number; confidence: [number, number] }[] {
  if (expenses.length === 0) return [];

  const lastDate = new Date(Math.max(...expenses.map(e => new Date(e.date).getTime())));
  const baseTime = new Date(expenses[0].date).getTime();
  const predictions: { date: Date; predicted: number; confidence: [number, number] }[] = [];

  // Calculate standard error
  const residuals = expenses.map(e => {
    const x = (new Date(e.date).getTime() - baseTime) / (1000 * 60 * 60 * 24);
    const predicted = regression.slope * x + regression.intercept;
    return e.amount - predicted;
  });
  const stdError = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);

  for (let i = 1; i <= daysAhead; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);
    
    const x = (futureDate.getTime() - baseTime) / (1000 * 60 * 60 * 24);
    const predicted = Math.max(0, regression.slope * x + regression.intercept);
    
    // 95% confidence interval (±2 standard errors)
    const margin = 2 * stdError;
    const confidence: [number, number] = [
      Math.max(0, predicted - margin),
      predicted + margin,
    ];

    predictions.push({ date: futureDate, predicted, confidence });
  }

  return predictions;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

export function detectAnomalies(expenses: Expense[], threshold: number = 2): AnomalyDetection {
  const categoriesMap = new Map<CategoryType, Expense[]>();
  
  // Group by category
  expenses.forEach(e => {
    if (!categoriesMap.has(e.category)) {
      categoriesMap.set(e.category, []);
    }
    categoriesMap.get(e.category)!.push(e);
  });

  const anomalies: AnomalyDetection['anomalies'] = [];

  // Check each category
  categoriesMap.forEach((categoryExpenses, category) => {
    if (categoryExpenses.length < 3) return; // Need at least 3 data points

    const amounts = categoryExpenses.map(e => e.amount);
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies
    categoryExpenses.forEach(expense => {
      const zScore = stdDev > 0 ? (expense.amount - mean) / stdDev : 0;
      
      if (Math.abs(zScore) > threshold) {
        const severity = Math.abs(zScore) > 3 ? 'high' : Math.abs(zScore) > 2.5 ? 'medium' : 'low';
        anomalies.push({
          expense,
          zScore,
          categoryAvg: mean,
          categoryStdDev: stdDev,
          severity,
        });
      }
    });
  });

  // Sort by severity and z-score
  anomalies.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[b.severity] - severityOrder[a.severity];
    }
    return Math.abs(b.zScore) - Math.abs(a.zScore);
  });

  return { anomalies, threshold };
}

// ============================================================================
// STATISTICAL SUMMARY
// ============================================================================

export function calculateStatistics(expenses: Expense[]): StatisticalSummary[] {
  const categoriesMap = new Map<CategoryType, Expense[]>();
  
  // Group by category
  expenses.forEach(e => {
    if (!categoriesMap.has(e.category)) {
      categoriesMap.set(e.category, []);
    }
    categoriesMap.get(e.category)!.push(e);
  });

  const summaries: StatisticalSummary[] = [];

  categoriesMap.forEach((categoryExpenses, category) => {
    const amounts = categoryExpenses.map(e => e.amount).sort((a, b) => a - b);
    const count = amounts.length;
    const total = amounts.reduce((sum, a) => sum + a, 0);
    const mean = total / count;

    // Median
    const mid = Math.floor(count / 2);
    const median = count % 2 === 0 ? (amounts[mid - 1] + amounts[mid]) / 2 : amounts[mid];

    // Standard deviation
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    // Min/Max
    const min = amounts[0];
    const max = amounts[count - 1];

    // Quartiles
    const q1Index = Math.floor(count * 0.25);
    const q3Index = Math.floor(count * 0.75);
    const q1 = amounts[q1Index];
    const q3 = amounts[q3Index];

    summaries.push({
      category,
      count,
      total,
      mean,
      median,
      stdDev,
      min,
      max,
      q1,
      q3,
    });
  });

  return summaries.sort((a, b) => b.total - a.total);
}

// ============================================================================
// DATE RANGE COMPARISON
// ============================================================================

export function compareDateRanges(
  expenses: Expense[],
  range1Start: Date,
  range1End: Date,
  range2Start: Date,
  range2End: Date
): DateRangeComparison {
  const range1Expenses = expenses.filter(e => {
    const date = new Date(e.date);
    return date >= range1Start && date <= range1End;
  });

  const range2Expenses = expenses.filter(e => {
    const date = new Date(e.date);
    return date >= range2Start && date <= range2End;
  });

  const range1Total = range1Expenses.reduce((sum, e) => sum + e.amount, 0);
  const range2Total = range2Expenses.reduce((sum, e) => sum + e.amount, 0);

  const range1Days = Math.ceil((range1End.getTime() - range1Start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const range2Days = Math.ceil((range2End.getTime() - range2Start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const range1AvgDaily = range1Total / range1Days;
  const range2AvgDaily = range2Total / range2Days;

  return {
    range1: {
      startDate: range1Start,
      endDate: range1End,
      total: range1Total,
      avgDaily: range1AvgDaily,
      count: range1Expenses.length,
    },
    range2: {
      startDate: range2Start,
      endDate: range2End,
      total: range2Total,
      avgDaily: range2AvgDaily,
      count: range2Expenses.length,
    },
    comparison: {
      totalChange: range1Total - range2Total,
      totalChangePercent: range2Total > 0 ? ((range1Total - range2Total) / range2Total) * 100 : 0,
      avgDailyChange: range1AvgDaily - range2AvgDaily,
      countChange: range1Expenses.length - range2Expenses.length,
    },
  };
}
