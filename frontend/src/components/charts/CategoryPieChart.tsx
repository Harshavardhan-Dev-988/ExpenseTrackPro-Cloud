import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, type PieLabelRenderProps } from 'recharts';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CategoryStats, CategoryType } from '../../types';
import { formatMoney, getCategoryGroupBreakdown } from '../../utils/helpers';
import CountUp from '../ui/CountUp';
import { shades } from '../../utils/categoryRegistry';

interface CategoryPieChartProps {
  categoryStats: CategoryStats[];
  currency: string;
  /** Compact mode: smaller pie + tighter legend — for pairing this card
   * side-by-side with another chart on the dashboard. */
  compact?: boolean;
  /** Open the entries behind one category (the dashboard's category popup). */
  onSelectCategory?: (category: CategoryType) => void;
}

const RADIAN = Math.PI / 180;

interface Slice {
  key: string;
  name: string;
  icon?: string;
  value: number;
  count: number;
  color: string;
}

/**
 * Spend by category group as a donut. Clicking a slice (or its legend row)
 * drills into that group: the donut redraws with the group's sub-categories
 * in shades of the group's colour, with a breadcrumb back to all groups.
 * At the sub-category level a click opens that category's entries.
 */
export default function CategoryPieChart({ categoryStats, currency, compact = false, onSelectCategory }: CategoryPieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const groups = useMemo(() => getCategoryGroupBreakdown(categoryStats), [categoryStats]);
  const drilled = drillId ? groups.find((g) => g.id === drillId) ?? null : null;

  const slices: Slice[] = useMemo(() => {
    if (drilled) {
      const colors = shades(drilled.color, drilled.subcategories.length);
      return drilled.subcategories.map((s, i) => ({
        key: s.category,
        name: s.label,
        value: s.total,
        count: s.count,
        color: colors[i],
      }));
    }
    return groups.map((g) => ({ key: g.id, name: g.name, icon: g.icon, value: g.value, count: g.count, color: g.color }));
  }, [groups, drilled]);

  const grandTotal = groups.reduce((sum, g) => sum + g.value, 0);
  const levelTotal = slices.reduce((sum, s) => sum + s.value, 0);
  const levelEntries = slices.reduce((sum, s) => sum + s.count, 0);
  const formatCurrency = (value: number) => formatMoney(value, currency);
  // The donut hole is small: whole rupees there, and keep the text inside it.
  const holeMoney = (value: number) => formatMoney(Math.round(value), currency);
  const holeWidth = (compact ? 50 : 68) * 2 - 14;

  const backToGroups = () => {
    setDrillId(null);
    setActiveIndex(null);
  };

  const select = (index: number) => {
    const slice = slices[index];
    if (!slice) return;
    setActiveIndex(null);
    if (!drilled) setDrillId(slice.key);
    else onSelectCategory?.(slice.key as CategoryType);
  };

  // Outer leader-line labels — a thin elbowed line from the slice edge out
  // to the name, the way a printed statement's chart labels its wedges.
  const lineLength = compact ? 14 : 22;
  const elbowLength = compact ? 14 : 22;
  const renderLeaderLabel = (props: PieLabelRenderProps) => {
    const cx = Number(props.cx);
    const cy = Number(props.cy);
    const midAngle = props.midAngle ?? 0;
    const outerRadius = Number(props.outerRadius);
    const { percent = 0, index = 0 } = props;
    const name = String(props.name ?? '');
    if (percent < 0.03) return null;
    const color = slices[index]?.color || 'rgb(var(--slate))';
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 4) * cos;
    const sy = cy + (outerRadius + 4) * sin;
    const mx = cx + (outerRadius + lineLength) * cos;
    const my = cy + (outerRadius + lineLength) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * elbowLength;
    const label = compact && name.length > 11 ? `${name.slice(0, 10)}…` : name;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} stroke={color} strokeWidth={1} fill="none" opacity={0.7} />
        <circle cx={ex} cy={my} r={1.5} fill={color} stroke="none" />
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 4}
          y={my}
          textAnchor={cos >= 0 ? 'start' : 'end'}
          dominantBaseline="central"
          className="font-mono"
          style={{ fontSize: compact ? 9 : 10.5, fill: 'rgb(var(--ink) / 0.75)' }}
        >
          {label}
        </text>
      </g>
    );
  };

  const active = activeIndex !== null ? slices[activeIndex] : null;
  const activePct = active && levelTotal > 0 ? (active.value / levelTotal) * 100 : 0;

  return (
    <div className={`relative overflow-hidden ${compact ? 'card-surface p-4 sm:p-5' : 'card-surface p-5 sm:p-6'}`}>
      <div className="aura aura-brass" aria-hidden="true" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={compact ? 'font-display text-base font-semibold text-ink mb-0.5' : 'font-display text-lg font-semibold text-ink mb-1'}>
              Expenses by category
            </h2>
            <nav aria-label="Chart level" className="flex items-center gap-1.5 text-xs font-mono mb-3 min-w-0">
              {drilled ? (
                <>
                  <button type="button" onClick={backToGroups} className="text-pine-strong dark:text-pine hover:underline underline-offset-2 shrink-0">
                    All groups
                  </button>
                  <span className="text-slate" aria-hidden="true">›</span>
                  <span className="text-ink truncate" aria-current="page">
                    {drilled.icon} {drilled.name}
                  </span>
                </>
              ) : (
                <span className="text-slate">{groups.length} groups · click a slice to open it</span>
              )}
            </nav>
          </div>
          {drilled && (
            <button
              type="button"
              onClick={backToGroups}
              className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-line text-xs font-medium text-ink hover:border-pine hover:text-pine-strong"
              aria-label="Back to all groups"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={drilled?.id ?? 'groups'}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: drilled ? 0.94 : 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: drilled ? 1.04 : 0.94 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={compact ? 'flex flex-col gap-1' : 'flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6'}
          >
            <div className="relative flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={compact ? 220 : 340}>
                <PieChart margin={compact ? { top: 8, right: 24, bottom: 8, left: 24 } : { top: 12, right: 24, bottom: 12, left: 24 }}>
                  <Pie
                    data={slices}
                    nameKey="name"
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderLeaderLabel}
                    innerRadius={compact ? 50 : 68}
                    outerRadius={compact ? 76 : 108}
                    paddingAngle={slices.length > 1 ? 1 : 0}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(_, index) => select(index)}
                    animationBegin={0}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {slices.map((s, index) => (
                      <Cell
                        key={s.key}
                        fill={s.color}
                        stroke="rgb(var(--surface))"
                        strokeWidth={2}
                        opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                        style={{ cursor: drilled && !onSelectCategory ? 'default' : 'pointer', transition: 'opacity 0.2s ease', outline: 'none' }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* The hole reads this level's total, or the slice under the cursor. */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <AnimatePresence mode="wait">
                  {active ? (
                    <motion.div
                      key={active.key}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.18 }}
                      className="text-center"
                      style={{ maxWidth: holeWidth }}
                    >
                      <p className="text-[8.5px] uppercase tracking-wide font-mono mb-0.5 truncate" style={{ color: active.color }}>
                        {active.name}
                      </p>
                      <p className={`font-mono tabular font-semibold text-ink leading-tight ${compact ? 'text-[12px]' : 'text-base'}`}>
                        {holeMoney(active.value)}
                      </p>
                      <p className="text-[9px] text-slate mt-0.5">
                        {activePct.toFixed(1)}%{drilled ? ` of ${drilled.name}` : ''}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="total"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.18 }}
                      className="text-center"
                      style={{ maxWidth: holeWidth }}
                    >
                      <p className="text-[8.5px] uppercase tracking-wide text-slate font-mono mb-0.5 truncate">
                        {drilled ? drilled.name : 'Total'}
                      </p>
                      <p className={`font-mono tabular font-semibold text-ink leading-tight ${compact ? 'text-[12px]' : 'text-base'}`}>
                        <CountUp value={levelTotal} formatter={holeMoney} />
                      </p>
                      <p className="text-[9px] text-slate mt-0.5">
                        {drilled && grandTotal > 0
                          ? `${((levelTotal / grandTotal) * 100).toFixed(1)}% of all spend`
                          : `${levelEntries} entries`}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Legend — each row is a button, so the drill-down works by keyboard too. */}
            <ul className={compact ? 'w-full space-y-0.5' : 'w-full lg:w-64 shrink-0 space-y-0.5'}>
              {slices.map((s, index) => {
                const pct = levelTotal > 0 ? (s.value / levelTotal) * 100 : 0;
                const isActive = activeIndex === index;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => select(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      onFocus={() => setActiveIndex(index)}
                      onBlur={() => setActiveIndex(null)}
                      className={`w-full flex items-center justify-between gap-3 text-sm py-1 px-1.5 rounded-md transition-colors text-left ${
                        isActive ? 'bg-paper' : ''
                      }`}
                      title={drilled ? (onSelectCategory ? `See ${s.name} entries` : s.name) : `Open ${s.name}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-ink/85 truncate text-xs">{s.name}</span>
                      </span>
                      <span className="flex items-baseline gap-2.5 shrink-0 font-mono tabular">
                        <span className="text-ink text-xs font-medium">{formatCurrency(s.value)}</span>
                        <span className="text-slate text-[11px] w-9 text-right">{pct.toFixed(1)}%</span>
                        {!drilled && <span className="text-slate text-[11px]" aria-hidden="true">›</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {drilled && onSelectCategory && <li className="pt-1 text-[11px] text-slate px-1.5">Click a category to see its entries.</li>}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
