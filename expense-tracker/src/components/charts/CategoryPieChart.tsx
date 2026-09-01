import { useState, useRef, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import type { CategoryStats } from '../../types';
import { CATEGORY_LABELS, CATEGORY_GROUPS } from '../../utils/constants';
import { formatMoney } from '../../utils/helpers';
import CountUp from '../ui/CountUp';

interface CategoryPieChartProps {
  categoryStats: CategoryStats[];
  currency: string;
  /** Compact mode: smaller pie + tighter legend — for pairing this card
   * side-by-side with another chart on the dashboard. */
  compact?: boolean;
}

// A cohesive, muted spectrum drawn from the ledger palette rather than a
// default rainbow — enough distinct, low-saturation tones to carry ~10
// category groups without any one of them reading as "the app's color."
const PALETTE = [
  '#2F4D3F', // pine
  '#A9762E', // brass
  '#5C7A8A', // dusty slate-blue
  '#9C6B4F', // rust / terracotta (one slice among many, not the identity)
  '#6B8F71', // sage
  '#7C6A9C', // muted plum
  '#C9A66B', // sand
  '#8C5A5A', // dusty rose
  '#3E6E7E', // muted teal
  '#8C9A8C', // sage-grey
  '#B3492F', // ember
  '#5A6B8C', // slate-navy
  '#4F7942', // fern
];

const RADIAN = Math.PI / 180;

export default function CategoryPieChart({ categoryStats, currency, compact = false }: CategoryPieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipHovered, setTooltipHovered] = useState(false);
  const [tooltipData, setTooltipData] = useState<any>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group categories by their main category group, colored from the ledger
  // palette above (index-based, so the same group reads the same color
  // every time regardless of how many groups have spend this period).
  const chartData = CATEGORY_GROUPS.map((group, i) => {
    const groupTotal = categoryStats
      .filter(stat => group.categories.includes(stat.category))
      .reduce((sum, stat) => sum + stat.total, 0);

    const groupCount = categoryStats
      .filter(stat => group.categories.includes(stat.category))
      .reduce((sum, stat) => sum + stat.count, 0);

    const subcategories = categoryStats
      .filter(stat => group.categories.includes(stat.category) && stat.total > 0)
      .map(stat => ({
        category: stat.category,
        label: CATEGORY_LABELS[stat.category] || stat.category,
        total: stat.total,
        count: stat.count,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      name: group.name,
      value: groupTotal,
      count: groupCount,
      color: PALETTE[i % PALETTE.length],
      subcategories,
    };
  })
    .filter(group => group.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalAmount = chartData.reduce((sum, item) => sum + item.value, 0);

  const formatCurrency = (value: number) => formatMoney(value, currency);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      if (tooltipData?.name !== data.name) {
        setTooltipData(data);
      }
    }

    const shouldShowTooltip = (hoveredIndex !== null || tooltipHovered) && tooltipData;

    if (shouldShowTooltip) {
      const data = tooltipData;
      const percentage = ((data.value / totalAmount) * 100).toFixed(1);
      const subcategories = data.payload.subcategories || [];

      return (
        <div
          className="card-surface p-4 max-w-md z-50"
          onMouseEnter={() => {
            if (leaveTimeoutRef.current) {
              clearTimeout(leaveTimeoutRef.current);
              leaveTimeoutRef.current = null;
            }
            setTooltipHovered(true);
            setHoveredIndex(activeIndex);
          }}
          onMouseLeave={() => {
            setTooltipHovered(false);
            leaveTimeoutRef.current = setTimeout(() => {
              setHoveredIndex(null);
              setActiveIndex(null);
              setTooltipData(null);
            }, 200);
          }}
          style={{ pointerEvents: 'auto' }}
        >
          <p className="font-display font-semibold text-ink mb-3 border-b border-line pb-2">{data.name}</p>

          <div className="mb-3 space-y-1 font-mono">
            <p className="text-xs text-slate">
              Total <span className="ml-1 font-semibold text-ink tabular">{formatCurrency(data.value)}</span>
            </p>
            <p className="text-xs text-slate">
              Share <span className="ml-1 font-semibold text-ink tabular">{percentage}%</span>
            </p>
            <p className="text-xs text-slate">
              Entries <span className="ml-1 font-semibold text-ink tabular">{data.payload.count}</span>
            </p>
          </div>

          {subcategories.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="text-[10px] font-semibold text-slate mb-2 uppercase tracking-wide">Subcategories</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {subcategories.map((sub: any, idx: number) => {
                  const subPercentage = ((sub.total / data.value) * 100).toFixed(1);
                  return (
                    <div key={idx} className="flex justify-between items-start text-xs bg-paper p-2 rounded-md">
                      <div className="flex-1">
                        <p className="font-medium text-ink">{sub.label}</p>
                        <p className="text-slate">{sub.count} entr{sub.count !== 1 ? 'ies' : 'y'}</p>
                      </div>
                      <div className="text-right ml-2 font-mono">
                        <p className="font-semibold text-ink tabular">{formatCurrency(sub.total)}</p>
                        <p className="text-slate tabular">{subPercentage}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const onPieEnter = (_: any, index: number) => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setActiveIndex(index);
    setHoveredIndex(index);
    setTooltipHovered(false);
  };

  const onPieLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      if (!tooltipHovered) {
        setActiveIndex(null);
        setHoveredIndex(null);
        setTooltipData(null);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  // Outer leader-line labels — a thin elbowed line from the slice edge out
  // to the category name, the way a printed statement's "total expenses"
  // chart would label its wedges rather than crowding text onto them.
  const lineLength = compact ? 14 : 22;
  const elbowLength = compact ? 14 : 22;
  const renderLeaderLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, index, name } = props;
    if (percent < 0.02) return null;
    const color = chartData[index]?.color || 'rgb(var(--slate))';
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 4) * cos;
    const sy = cy + (outerRadius + 4) * sin;
    const mx = cx + (outerRadius + lineLength) * cos;
    const my = cy + (outerRadius + lineLength) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * elbowLength;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    const label = compact && name.length > 14 ? `${name.slice(0, 13)}…` : name;

    return (
      <g style={{ pointerEvents: 'none' }}>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={color} strokeWidth={1} fill="none" opacity={0.7} />
        <circle cx={ex} cy={ey} r={1.5} fill={color} stroke="none" />
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 4}
          y={ey}
          textAnchor={textAnchor}
          dominantBaseline="central"
          className="font-mono"
          style={{ fontSize: compact ? 9 : 10.5, fill: 'rgb(var(--ink) / 0.75)' }}
        >
          {label}
        </text>
      </g>
    );
  };

  const totalEntries = chartData.reduce((sum, d) => sum + d.count, 0);
  const activeEntry = activeIndex !== null ? chartData[activeIndex] : null;
  const activePct = activeEntry && totalAmount > 0 ? (activeEntry.value / totalAmount) * 100 : 0;

  return (
    <div className={`relative overflow-hidden ${compact ? 'card-surface p-4 sm:p-5' : 'card-surface p-5 sm:p-6'}`}>
      <div className="aura aura-brass" aria-hidden="true" />
      <div className="relative z-10">
        <h2 className={compact ? 'font-display text-base font-semibold text-ink mb-0.5' : 'font-display text-lg font-semibold text-ink mb-1'}>Expenses by category</h2>
        <p className="text-xs text-slate font-mono mb-3">{chartData.length} groups · hover for the breakdown</p>

        <div className={compact ? 'flex flex-col gap-1' : 'flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6'}>
          <div className="relative flex-1 min-w-0">
            <ResponsiveContainer width="100%" height={compact ? 220 : 340}>
              <PieChart margin={compact ? { top: 8, right: 8, bottom: 8, left: 8 } : { top: 12, right: 24, bottom: 12, left: 24 }}>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderLeaderLabel}
                  innerRadius={compact ? 42 : 68}
                  outerRadius={compact ? 68 : 108}
                  paddingAngle={1}
                  dataKey="value"
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="rgb(var(--surface))"
                      strokeWidth={2}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                      style={{
                        filter: activeIndex === index ? 'brightness(1.08)' : 'none',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} wrapperStyle={{ pointerEvents: 'auto', zIndex: 1000 }} />
              </PieChart>
            </ResponsiveContainer>

            {/* The donut's hole isn't empty — it reads the grand total by
                default and swaps to whatever slice is under the cursor (or
                being hovered in the legend below), the way a statement's
                pie chart earns the space at its own center instead of
                leaving it blank. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                {activeEntry ? (
                  <motion.div
                    key={activeEntry.name}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center px-2 max-w-[80%]"
                  >
                    <p
                      className="text-[8.5px] uppercase tracking-wide font-mono mb-0.5 truncate"
                      style={{ color: activeEntry.color }}
                    >
                      {activeEntry.name}
                    </p>
                    <p className={`font-mono tabular font-semibold text-ink leading-tight ${compact ? 'text-[13px]' : 'text-base'}`}>
                      {formatCurrency(activeEntry.value)}
                    </p>
                    {!compact && <p className="text-[9px] text-slate mt-0.5">{activePct.toFixed(1)}% of total</p>}
                  </motion.div>
                ) : (
                  <motion.div
                    key="total"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center px-2"
                  >
                    <p className="text-[8.5px] uppercase tracking-wide text-slate font-mono mb-0.5">Total</p>
                    <p className={`font-mono tabular font-semibold text-ink leading-tight ${compact ? 'text-[13px]' : 'text-base'}`}>
                      <CountUp value={totalAmount} formatter={formatCurrency} />
                    </p>
                    {!compact && <p className="text-[9px] text-slate mt-0.5">{totalEntries} entries</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Legend as a statement-style list: swatch + name, amount, share —
              same information the leader lines give at a glance, laid out so
              it can also be scanned and compared top to bottom. */}
          <div className={compact ? 'w-full space-y-0.5' : 'w-full lg:w-64 shrink-0 space-y-0.5'}>
            {chartData.map((entry, index) => {
              const pct = totalAmount > 0 ? (entry.value / totalAmount) * 100 : 0;
              const isActive = activeIndex === index;
              return (
                <motion.div
                  key={entry.name}
                  className="flex items-center justify-between gap-3 text-sm py-1 px-1.5 rounded-md transition-colors cursor-pointer"
                  animate={{ backgroundColor: isActive ? 'rgb(var(--paper))' : 'rgba(0,0,0,0)' }}
                  transition={{ duration: 0.2 }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <motion.span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: entry.color }}
                      animate={{ scale: isActive ? 1.35 : 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    />
                    <span className="text-ink/85 truncate text-xs">{entry.name}</span>
                  </span>
                  <span className="flex items-baseline gap-2.5 shrink-0 font-mono tabular">
                    <span className="text-ink text-xs font-medium">{formatCurrency(entry.value)}</span>
                    <span className="text-slate text-[11px] w-9 text-right">{pct.toFixed(1)}%</span>
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
