import { motion } from 'framer-motion';
import type { CategoryStats } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
import { getCategoryIcon, formatMoney } from '../../utils/helpers';

interface CategoryBreakdownProps {
  stats: CategoryStats[];
  total: number;
  currency: string;
  limit?: number;
}

/**
 * "Where it went" — a ranked ledger of categories rather than a pie chart.
 * Pie charts are lovely for a handful of slices; this app has up to ~80
 * categories, so a sortable, scannable list of bars reads the actual
 * numbers better than trying to compare wedge angles.
 */
export default function CategoryBreakdown({ stats, total, currency, limit = 7 }: CategoryBreakdownProps) {
  const ranked = [...stats].sort((a, b) => b.total - a.total).slice(0, limit);
  const maxTotal = ranked.length > 0 ? ranked[0].total : 1;

  if (ranked.length === 0) {
    return <p className="text-sm text-slate">Nothing recorded for this period yet.</p>;
  }

  return (
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
            whileHover={{ x: 2 }}
            className="group -mx-1.5 px-1.5 py-0.5 rounded-md transition-colors hover:bg-paper"
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
              <span className="flex items-baseline gap-2 shrink-0">
                <span className="font-mono tabular text-sm font-semibold text-ink">
                  {formatMoney(stat.total, currency)}
                </span>
                <span className="font-mono tabular text-[11px] text-slate w-10 text-right">{pct.toFixed(0)}%</span>
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
          </motion.li>
        );
      })}
    </ul>
  );
}
