import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, eachDayOfInterval, subMonths, startOfYear, endOfYear, differenceInDays, differenceInMonths, parseISO } from 'date-fns';
import type { Expense } from '../../types';

interface MonthlyTrendChartProps {
  expenses: Expense[];
  currency: string;
  dateRangeType?: 'all' | 'month' | 'year' | 'today' | 'custom';
  selectedMonth?: string; // Format: YYYY-MM
  selectedYear?: string; // Format: YYYY
  customStartDate?: Date;
  customEndDate?: Date;
}

export default function MonthlyTrendChart({ 
  expenses, 
  currency,
  dateRangeType = 'all',
  selectedMonth,
  selectedYear,
  customStartDate,
  customEndDate
}: MonthlyTrendChartProps) {
  
  const { chartData, title, subtitle, xAxisKey } = useMemo(() => {
    const now = new Date();

    // Determine chart type and data based on date range
    if (dateRangeType === 'today') {
      // For "today", show hourly breakdown
      const hourlyData = Array.from({ length: 24 }, (_, hour) => {
        const hourExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate.getHours() === hour;
        });
        const total = hourExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        return {
          period: `${hour.toString().padStart(2, '0')}:00`,
          total: parseFloat(total.toFixed(2)),
          count: hourExpenses.length,
          average: hourExpenses.length > 0 ? parseFloat((total / hourExpenses.length).toFixed(2)) : 0,
        };
      }).filter(data => data.count > 0); // Only show hours with transactions

      return {
        chartData: hourlyData.length > 0 ? hourlyData : [{ period: 'No data', total: 0, count: 0, average: 0 }],
        title: 'Today\'s Spending Pattern',
        subtitle: 'Hourly breakdown',
        xAxisKey: 'period'
      };
    }

    if (dateRangeType === 'month' && selectedMonth) {
      // For specific month, show daily breakdown
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = startOfMonth(new Date(year, month - 1, 1));
      const monthEnd = endOfMonth(new Date(year, month - 1, 1));
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const dailyData = days.map(day => {
        const dayExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          return format(expenseDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
        });
        const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        return {
          period: format(day, 'd MMM'),
          total: parseFloat(total.toFixed(2)),
          count: dayExpenses.length,
          average: dayExpenses.length > 0 ? parseFloat((total / dayExpenses.length).toFixed(2)) : 0,
        };
      });

      return {
        chartData: dailyData,
        title: 'Daily Spending Trend',
        subtitle: format(monthStart, 'MMMM yyyy'),
        xAxisKey: 'period'
      };
    }

    if (dateRangeType === 'year' && selectedYear) {
      // For specific year, show monthly breakdown
      const yearStart = startOfYear(new Date(parseInt(selectedYear), 0, 1));
      const yearEnd = endOfYear(new Date(parseInt(selectedYear), 0, 1));
      const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

      const monthlyData = months.map(month => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const monthExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= monthStart && expenseDate <= monthEnd;
        });
        const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        return {
          period: format(month, 'MMM'),
          total: parseFloat(total.toFixed(2)),
          count: monthExpenses.length,
          average: monthExpenses.length > 0 ? parseFloat((total / monthExpenses.length).toFixed(2)) : 0,
        };
      });

      return {
        chartData: monthlyData,
        title: 'Monthly Spending Trend',
        subtitle: selectedYear,
        xAxisKey: 'period'
      };
    }

    if (dateRangeType === 'custom' && customStartDate && customEndDate) {
      // For custom range, adapt based on duration
      const daysDiff = differenceInDays(customEndDate, customStartDate);
      
      if (daysDiff <= 31) {
        // Less than a month - show daily
        const days = eachDayOfInterval({ start: customStartDate, end: customEndDate });
        const dailyData = days.map(day => {
          const dayExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return format(expenseDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          });
          const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
          return {
            period: format(day, 'd MMM'),
            total: parseFloat(total.toFixed(2)),
            count: dayExpenses.length,
            average: dayExpenses.length > 0 ? parseFloat((total / dayExpenses.length).toFixed(2)) : 0,
          };
        });
        return {
          chartData: dailyData,
          title: 'Daily Spending Trend',
          subtitle: `${format(customStartDate, 'd MMM')} - ${format(customEndDate, 'd MMM yyyy')}`,
          xAxisKey: 'period'
        };
      } else {
        // More than a month - show monthly
        const months = eachMonthOfInterval({ start: customStartDate, end: customEndDate });
        const monthlyData = months.map(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const monthExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= monthStart && expenseDate <= monthEnd;
          });
          const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
          return {
            period: format(month, 'MMM yyyy'),
            total: parseFloat(total.toFixed(2)),
            count: monthExpenses.length,
            average: monthExpenses.length > 0 ? parseFloat((total / monthExpenses.length).toFixed(2)) : 0,
          };
        });
        return {
          chartData: monthlyData,
          title: 'Monthly Spending Trend',
          subtitle: `${format(customStartDate, 'MMM yyyy')} - ${format(customEndDate, 'MMM yyyy')}`,
          xAxisKey: 'period'
        };
      }
    }

    // Default: 'all' or fallback - show last 12 months
    const endDate = new Date();
    const startDate = subMonths(endDate, 11);
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    const monthlyData = months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthExpenses = expenses.filter((expense) => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= monthStart && expenseDate <= monthEnd;
      });

      const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const count = monthExpenses.length;

      return {
        period: format(month, 'MMM yyyy'),
        total: parseFloat(total.toFixed(2)),
        count,
        average: count > 0 ? parseFloat((total / count).toFixed(2)) : 0,
      };
    });

    return {
      chartData: monthlyData,
      title: 'Monthly Spending Trend',
      subtitle: 'Last 12 months • Hover for details',
      xAxisKey: 'period'
    };
  }, [expenses, dateRangeType, selectedMonth, selectedYear, customStartDate, customEndDate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="card-surface px-3.5 py-3 text-sm">
          <p className="font-medium text-ink mb-1.5">{label}</p>
          <p className="text-xs text-slate">
            Total <span className="ml-1 font-mono tabular font-medium text-pine-strong dark:text-pine">{formatCurrency(payload[0].value)}</span>
          </p>
          <p className="text-xs text-slate">
            Avg / transaction <span className="ml-1 font-mono tabular font-medium text-brass-strong dark:text-brass">{formatCurrency(payload[1]?.value || 0)}</span>
          </p>
          <p className="text-xs text-slate">
            Transactions <span className="ml-1 font-mono tabular font-medium text-ink">{payload[0].payload.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-ink mb-1">
        {title}
      </h2>
      <p className="text-xs text-slate font-mono mb-4">
        {subtitle}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 6" stroke="rgb(var(--line))" vertical={false} />
          <XAxis
            dataKey={xAxisKey}
            stroke="rgb(var(--slate))"
            style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
            angle={chartData.length > 15 ? -45 : 0}
            textAnchor={chartData.length > 15 ? "end" : "middle"}
            height={chartData.length > 15 ? 80 : 60}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--line))' }}
          />
          <YAxis
            stroke="rgb(var(--slate))"
            style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
            tickFormatter={formatCurrency}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgb(var(--line))', strokeWidth: 1 }} />
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: 'rgb(var(--slate))' }} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="rgb(var(--pine))"
            strokeWidth={3}
            dot={{ fill: 'rgb(var(--pine))', r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
            activeDot={{ r: 7, strokeWidth: 2, stroke: 'rgb(var(--pine))' }}
            name="Total Spending"
            animationDuration={1000}
            animationEasing="ease-in-out"
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke="rgb(var(--brass))"
            strokeWidth={2}
            dot={{ fill: 'rgb(var(--brass))', r: 3, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'rgb(var(--brass))' }}
            name="Average per Transaction"
            strokeDasharray="5 5"
            animationDuration={1000}
            animationEasing="ease-in-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
