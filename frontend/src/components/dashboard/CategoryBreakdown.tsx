import { motion } from 'framer-motion';
import type { CategoryStats, CategoryType } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
import { getCategoryIcon, formatMoney } from '../../utils/helpers';

interface CategoryBreakdownProps {
  stats: CategoryStats[];
  total: number;
  currency: string;
  limit?: number;
  /** Opens a detail popup listing every entry behind this category's bar. */
  onSelectCategory?: (category: CategoryType) => void;
}

/**
 * "Where it went" — a ranked ledger of categories rather than a pie chart.
 * Pie charts are lovely for a handful of slices; this app has up to ~80
 * categories, so a sortable, scannable list of bars reads the actual
 * numbers better than trying to compare wedge angles. Each row doubles as
 * a button into that category's own entries, so the summary is a way in
 * rather than a dead end.
 */
export default function CategoryBreakdown({ stats, total, currency, limit = 10, onSelectCategory }: CategoryBreakdownProps) {
  const ranked = [...stats].sort((a, b) => b.total - a.total).slice(0, limit);
  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;

  if (ranked.length === 0) {
    return <p className="text-sm text-slate">Nothing recorded for this period yet.</p>;
  }

  return (
    <div>
      <ul className="flex flex-col gap-3.5">
      {ranked.map((stat, index) => {
        const pct = total > 0 ? (stat.total / total) * 100 : 0;
        const barPct = maxTotal > 0 ? (stat.total / maxTotal) * 100 : 0;
        const isTop = index === 0;
        return (
          <motion.li
            key={stat.category}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            whileHover={onSelectCategory ? { x: 2 } : undefined}
            className="group -mx-1.5 rounded-md"
          >
            <button
              type="button"
              onClick={() => onSelectCategory?.(stat.category)}
              disabled={!onSelectCategory}
              title={onSelectCategory ? `View every ${CATEGORY_LABELS[stat.category] || stat.category} entry` : undefined}
              className="w-full text-left px-1.5 py-0.5 rounded-md transition-colors hover:bg-paper disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/60"
              aria-haspopup={onSelectCategory ? 'dialog' : undefined}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink truncate">
                  <span aria-hidden="true">{getCategoryIcon(stat.category)}</span>
                  {CATEGORY_LABELS[stat.category] || stat.category}
                  {isTop && (
                    <span className="text-[9px] uppercase tracking-wide font-mono text-brass-strong dark:text-brass bg-brass/10 rounded-full px-1.5 py-0.5">
                      top
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0">
                  <span className="font-mono tabular text-sm font-semibold text-ink">
                    {formatMoney(stat.total, currency)}
                  </span>
                  <span className="font-mono tabular text-[11px] text-slate w-9 text-right">{pct.toFixed(0)}%</span>
                  {onSelectCategory && (
                    <svg
                      className="w-3 h-3 text-slate/50 group-hover:text-pine-strong dark:group-hover:text-pine group-hover:translate-x-0.5 transition-all shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line/70 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full transition-colors ${isTop ? 'bg-brass group-hover:bg-brass-strong' : 'bg-pine group-hover:bg-pine-strong'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </button>
          </motion.li>
        );
      })}
      </ul>
    </div>
  );
}
