import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: 'neutral' | 'pine' | 'brass' | 'ember';
  delay?: number;
}

const toneStyles: Record<NonNullable<StatTileProps['tone']>, string> = {
  neutral: 'text-ink',
  pine: 'text-pine-strong dark:text-pine',
  brass: 'text-brass-strong dark:text-brass',
  ember: 'text-ember-strong dark:text-ember',
};

/**
 * The single stat-tile primitive used across the dashboard's "quick
 * insights" row — one visual language for burn rate, average spend,
 * largest transaction and budget health, instead of four differently
 * gradiented cards competing for attention.
 */
export default function StatTile({ icon, label, value, sublabel, tone = 'neutral', delay = 0 }: StatTileProps) {
  return (
    <motion.div
      className="card-surface p-4 flex flex-col gap-2 cursor-default"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, boxShadow: '0 2px 4px rgb(23 33 29 / 0.05), 0 16px 40px -12px rgb(23 33 29 / 0.16)' }}
    >
      <div className="flex items-center justify-between">
        <motion.span
          className="text-lg leading-none opacity-80"
          aria-hidden="true"
          whileHover={{ scale: 1.15, rotate: -4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {icon}
        </motion.span>
        <span className="text-[10px] uppercase tracking-wider text-slate font-mono">{label}</span>
      </div>
      <p className={`font-mono tabular text-xl font-semibold leading-tight ${toneStyles[tone]}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate">{sublabel}</p>}
    </motion.div>
  );
}
