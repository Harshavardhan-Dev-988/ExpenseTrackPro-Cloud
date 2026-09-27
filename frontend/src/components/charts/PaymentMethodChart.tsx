import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Expense, PaymentMethod } from '../../types';
import { formatMoney } from '../../utils/helpers';
import StatTile from '../ui/StatTile';

interface PaymentMethodChartProps {
  expenses: Expense[];
  currency: string;
  /** Compact mode: smaller chart, capped bar width, fewer stat tiles — for
   * pairing this card side-by-side with another chart rather than giving
   * it a full-width row of its own. */
  compact?: boolean;
}

// Short axis labels for the compact card (e.g. "₹1.2L") so a narrow y-axis
// doesn't force the card wider than it needs to be.
const formatCompactAxis = (value: number, currency: string, compact: boolean) => {
  if (!compact) return formatMoney(value, currency);
  try {
    return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return formatMoney(value, currency);
  }
};

// A cohesive, muted spectrum drawn from the ledger palette rather than
// recharts' default rainbow — distinguishable without competing for attention.
const COLORS: Record<PaymentMethod, string> = {
  cash: '#A9762E',       // brass
  card: '#2F4D3F',       // pine
  upi: '#3E6E7E',        // muted teal
  netbanking: '#7C6A9C', // muted plum
  cheque: '#8C6A4F',     // warm taupe
  other: '#8C9A8C',      // sage-grey
};

export default function PaymentMethodChart({ expenses, currency, compact = false }: PaymentMethodChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const paymentMethodData = expenses.reduce((acc, expense) => {
    const method = expense.paymentMethod || 'other';
    if (!acc[method]) {
      acc[method] = { total: 0, count: 0 };
    }
    acc[method].total += expense.amount;
    acc[method].count += 1;
    return acc;
  }, {} as Record<PaymentMethod, { total: number; count: number }>);

  const chartData = Object.entries(paymentMethodData).map(([method, data]) => ({
    method: method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' '),
    methodKey: method,
    total: parseFloat(data.total.toFixed(2)),
    count: data.count,
    color: COLORS[method as PaymentMethod],
  }));

  chartData.sort((a, b) => b.total - a.total);

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const mostUsed = chartData[0];
  const avgPerTransaction = expenses.length > 0 ? totalSpent / expenses.length : 0;
  const digitalPayments = chartData
    .filter(d => ['Card', 'Upi', 'Netbanking'].includes(d.method))
    .reduce((sum, d) => sum + d.total, 0);
  const digitalPercentage = totalSpent > 0 ? (digitalPayments / totalSpent) * 100 : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalSpent > 0 ? ((data.total / totalSpent) * 100).toFixed(1) : '0';

      return (
        <div className="card-surface px-3.5 py-3 text-sm">
          <p className="font-medium text-ink mb-1.5">{data.method}</p>
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

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className={compact ? 'card-surface p-4 sm:p-5' : 'card-surface p-5 sm:p-6'}>
      <h2 className={compact ? 'font-display text-base font-semibold text-ink mb-0.5' : 'font-display text-lg font-semibold text-ink mb-1'}>How you're paying</h2>
      <p className="text-xs text-slate font-mono mb-3">Payment mix for this period</p>
      <ResponsiveContainer width="100%" height={compact ? 150 : 260}>
        <BarChart data={chartData} margin={{ left: -12 }} barSize={compact ? 26 : 40}>
          <CartesianGrid strokeDasharray="3 6" stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="method" stroke="rgb(var(--slate))" style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} />
          <YAxis
            stroke="rgb(var(--slate))"
            style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}
            tickFormatter={(v) => formatCompactAxis(v, currency, compact)}
            tickLine={false}
            axisLine={false}
            width={compact ? 52 : 72}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--ink) / 0.04)' }} />
          <Bar
            dataKey="total"
            radius={[6, 6, 0, 0]}
            animationDuration={900}
            animationEasing="ease-out"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
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

      <div className={compact ? 'mt-3 grid grid-cols-2 gap-2' : 'mt-5 grid grid-cols-2 md:grid-cols-4 gap-3'}>
        <StatTile icon="⭐" label="Most used" value={mostUsed?.method || '—'} sublabel={mostUsed ? formatMoney(mostUsed.total, currency) : undefined} />
        <StatTile icon="📶" label="Digital" value={`${digitalPercentage.toFixed(0)}%`} sublabel={formatMoney(digitalPayments, currency)} tone="pine" />
        {!compact && (
          <>
            <StatTile icon="Σ" label="Avg / entry" value={formatMoney(avgPerTransaction, currency)} />
            <StatTile icon="≡" label="Methods used" value={String(chartData.length)} sublabel="in this period" />
          </>
        )}
      </div>
    </div>
  );
}
