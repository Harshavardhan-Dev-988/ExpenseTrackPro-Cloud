import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import type { Expense } from '../../types';
import StatTile from '../ui/StatTile';

interface DailyExpensesChartProps {
  expenses: Expense[];
}

export default function DailyExpensesChart({ expenses }: DailyExpensesChartProps) {
  // Get available months from expenses
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach(expense => {
      const monthKey = format(new Date(expense.date), 'yyyy-MM');
      months.add(monthKey);
    });

    // Always include current month
    const currentMonth = format(new Date(), 'yyyy-MM');
    months.add(currentMonth);

    return Array.from(months).sort().reverse();
  }, [expenses]);

  // Default to most recent month with expenses, or current month
  const getDefaultMonth = () => {
    if (availableMonths.length === 0) {
      return new Date();
    }
    // Find the first month that has expenses
    const monthsWithExpenses = availableMonths.filter(month =>
      expenses.some(e => format(new Date(e.date), 'yyyy-MM') === month)
    );
    const defaultMonth = monthsWithExpenses.length > 0 ? monthsWithExpenses[0] : availableMonths[0];
    return new Date(defaultMonth + '-01');
  };

  const [selectedDate, setSelectedDate] = useState(getDefaultMonth());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Generate daily data for selected month
  const dailyData = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return days.map(day => {
      const dayExpenses = expenses.filter(expense =>
        isSameDay(new Date(expense.date), day)
      );

      const total = dayExpenses.reduce((sum, e) => sum + e.amount, 0);

      return {
        date: day,
        day: format(day, 'd'),
        fullDate: format(day, 'MMM dd, yyyy'),
        total: parseFloat(total.toFixed(2)),
        count: dayExpenses.length,
      };
    });
  }, [expenses, selectedDate]);

  // Calculate insights
  const insights = useMemo(() => {
    const monthTotal = dailyData.reduce((sum, d) => sum + d.total, 0);
    const daysWithExpenses = dailyData.filter(d => d.total > 0).length;
    const avgPerDay = daysWithExpenses > 0 ? monthTotal / daysWithExpenses : 0;
    const peakDay = dailyData.reduce((max, d) => d.total > max.total ? d : max, dailyData[0]);
    const totalTransactions = dailyData.reduce((sum, d) => sum + d.count, 0);

    return {
      total: monthTotal,
      avgPerDay,
      peakDay,
      daysWithExpenses,
      totalTransactions,
    };
  }, [dailyData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="card-surface px-3.5 py-3 text-sm">
          <p className="font-medium text-ink mb-1.5">{data.fullDate}</p>
          <p className="text-xs text-slate">
            Amount <span className="ml-1 font-mono tabular font-medium text-ink">{formatCurrency(data.total)}</span>
          </p>
          <p className="text-xs text-slate">
            Transactions <span className="ml-1 font-mono tabular font-medium text-ink">{data.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card-surface p-5 sm:p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink mb-1">
            Daily expenses
          </h2>
          <p className="text-xs text-slate font-mono">
            Day-by-day spending · hover for details
          </p>
        </div>

        {/* Month Selector */}
        <div>
          <label className="block text-xs text-slate font-mono mb-1">
            Select month
          </label>
          <select
            value={format(selectedDate, 'yyyy-MM')}
            onChange={(e) => setSelectedDate(new Date(e.target.value + '-01'))}
            className="px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm font-mono focus:ring-2 focus:ring-pine focus:border-transparent"
          >
            {availableMonths.map(month => (
              <option key={month} value={month}>
                {format(new Date(month + '-01'), 'MMMM yyyy')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Insights Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatTile
          icon="💰"
          label="Month total"
          value={formatCurrency(insights.total)}
          tone="pine"
        />
        <StatTile
          icon="Σ"
          label="Avg / day"
          value={formatCurrency(insights.avgPerDay)}
        />
        <StatTile
          icon="⭐"
          label="Peak day"
          value={insights.peakDay ? format(insights.peakDay.date, 'MMM d') : '—'}
          sublabel={formatCurrency(insights.peakDay?.total || 0)}
          tone="brass"
        />
        <StatTile
          icon="📅"
          label="Active days"
          value={String(insights.daysWithExpenses)}
        />
        <StatTile
          icon="🧾"
          label="Transactions"
          value={String(insights.totalTransactions)}
        />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dailyData}>
          <CartesianGrid strokeDasharray="3 6" stroke="rgb(var(--line))" vertical={false} />
          <XAxis
            dataKey="day"
            stroke="rgb(var(--slate))"
            style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
            label={{ value: 'Day of Month', position: 'insideBottom', offset: 0, fontSize: 12, fill: 'rgb(var(--slate))' }}
            tickLine={false}
            axisLine={{ stroke: 'rgb(var(--line))' }}
            height={60}
          />
          <YAxis
            stroke="rgb(var(--slate))"
            style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}
            tickFormatter={formatCurrency}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--ink) / 0.04)' }} />
          <Bar
            dataKey="total"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={(data) => setSelectedDay(data.date)}
          >
            {dailyData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.total > 0 ? 'rgb(var(--pine))' : 'rgb(var(--line))'}
                opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                style={{
                  filter: activeIndex === index ? 'brightness(1.2)' : 'none',
                  transition: 'all 0.3s ease',
                  cursor: entry.total > 0 ? 'pointer' : 'default',
                }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Expense List for Selected Day */}
      {selectedDay && (() => {
        const dayExpenses = expenses.filter(expense =>
          isSameDay(new Date(expense.date), selectedDay)
        );

        if (dayExpenses.length === 0) return null;

        return (
          <div className="mt-6 border-t border-line pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-ink">
                Expenses on {format(selectedDay, 'MMMM d, yyyy')} ({dayExpenses.length})
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-slate hover:text-pine-strong transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-paper [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
              {dayExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex justify-between items-center p-3 bg-paper rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">
                      {expense.description}
                    </p>
                    <p className="text-xs text-slate mt-1 font-mono">
                      {expense.paymentMethod?.toUpperCase() || 'CASH'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink font-mono tabular">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
