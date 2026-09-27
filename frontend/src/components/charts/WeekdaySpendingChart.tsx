import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Expense } from '../../types';
import { formatMoney } from '../../utils/helpers';

interface WeekdaySpendingChartProps {
  expenses: Expense[];
  currency: string;
  /** Compact mode: smaller chart, tighter padding — sized to sit under the
   * "How you're paying" card and fill the space that card leaves empty
   * next to the taller category pie chart. */
  compact?: boolean;
  /** Stretch the card (and the chart itself) to the full height of its
   * flex parent instead of a fixed pixel height — used on the dashboard so
   * this card's bottom edge lines up exactly with the taller pie chart
   * card beside it, whatever the data happens to produce, rather than
   * leaving a gap below a fixed-height chart. */
  fillHeight?: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatCompactAxis = (value: number) => {
  try {
    return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(value);
  }
};

/**
 * "Which day of the week costs the most" — a small weekday-of-spend
 * infographic that complements the single "busiest day" stat tile above
 * with the full Sun–Sat shape, so a pattern (e.g. weekend spending spikes)
 * is visible at a glance rather than reduced to one label.
 */
export default function WeekdaySpendingChart({ expenses, currency, compact = false, fillHeight = false }: WeekdaySpendingChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];
    const counts = new Array(7).fill(0) as number[];
    expenses.forEach((e) => {
      const day = new Date(e.date).getDay();
      totals[day] += e.amount;
      counts[day] += 1;
    });
    const maxTotal = Math.max(...totals);
    return DAY_LABELS.map((label, i) => ({
      day: label,
      total: parseFloat(totals[i].toFixed(2)),
      count: counts[i],
      isMax: totals[i] === maxTotal && maxTotal > 0,
    }));
  }, [expenses]);

  const totalSpent = chartData.reduce((sum, d) => sum + d.total, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalSpent > 0 ? ((data.total / totalSpent) * 100).toFixed(1) : '0';
      return (
        <div className="card-surface px-3.5 py-3 text-sm">
          <p className="font-medium text-ink mb-1.5">{data.day}</p>
          <p className="text-xs text-slate">
            Amount <span className="ml-1 font-mono tabular font-medium text-ink">{formatMoney(data.total, currency)}</span>
          </p>
          <p className="text-xs text-slate">
            Share <span className="ml-1 font-mono tabular font-medium text-ink">{percentage}%</span>
          </p>
          <p className="text-xs text-slate">
            Entries <span className="ml-1 font-mono tabular font-medium text-ink">{data.count}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (totalSpent === 0) {
    return null;
  }

  const chart = (
    <ResponsiveContainer width="100%" height={fillHeight ? '100%' : (compact ? 130 : 220)}>
      <BarChart data={chartData} margin={{ left: -12, top: 4 }} barSize={compact ? 18 : 32}>
        <XAxis
          dataKey="day"
          stroke="rgb(var(--slate))"
          style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}
          tickLine={false}
          axisLine={{ stroke: 'rgb(var(--line))' }}
        />
        <YAxis
          stroke="rgb(var(--slate))"
          style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}
          tickFormatter={formatCompactAxis}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--ink) / 0.04)' }} />
        <Bar
          dataKey="total"
          radius={[4, 4, 0, 0]}
          animationDuration={900}
          animationEasing="ease-out"
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isMax ? 'rgb(var(--brass))' : 'rgb(var(--pine))'}
              opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
              style={{
                transition: 'opacity 0.25s ease, filter 0.25s ease',
                filter: activeIndex === index ? 'drop-shadow(0 3px 6px rgb(23 33 29 / 0.22))' : 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className={`${compact ? 'card-surface p-4 sm:p-5' : 'card-surface p-5 sm:p-6'} ${fillHeight ? 'h-full flex flex-col' : ''}`}>
      <h2 className={compact ? 'font-display text-base font-semibold text-ink mb-0.5' : 'font-display text-lg font-semibold text-ink mb-1'}>
        Spending by weekday
      </h2>
      <p className="text-xs text-slate font-mono mb-3">Where the week's money goes, Sun–Sat</p>
      {fillHeight ? <div className="flex-1 min-h-0">{chart}</div> : chart}
    </div>
  );
}
