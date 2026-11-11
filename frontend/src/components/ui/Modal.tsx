/**
 * The app's standard dialog: dimmed backdrop, a card with an eyebrow, title
 * and subtitle, a scrolling body and an optional footer. Closes on the
 * backdrop, the × button or Escape. Render it inside <AnimatePresence>.
 */
import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface ModalProps {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class; default max-w-2xl. */
  width?: string;
  /** Extra content beside the title (e.g. an action button). */
  headerAction?: ReactNode;
}

export const inputCls =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine min-w-0';
export const labelCls = 'block text-[11px] font-mono uppercase tracking-wider text-slate mb-1';
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-ember/40 text-ember-strong dark:text-ember text-sm font-medium hover:bg-ember/8 transition-colors disabled:opacity-50 whitespace-nowrap';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate hover:text-ink hover:bg-paper transition-colors disabled:opacity-50 whitespace-nowrap';

export default function Modal({ title, eyebrow, subtitle, onClose, children, footer, width = 'max-w-2xl', headerAction }: ModalProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15 } }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className={`relative card-surface w-full ${width} max-h-[94vh] sm:max-h-[90vh] flex flex-col rounded-b-none sm:rounded-b-2xl`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
          <div className="min-w-0">
            {eyebrow && <p className="text-[10px] uppercase tracking-wider text-slate font-mono">{eyebrow}</p>}
            <h2 className="font-display text-2xl font-semibold text-ink leading-tight">{title}</h2>
            {subtitle && <div className="text-sm text-slate mt-0.5">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate hover:text-ink hover:bg-paper"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line bg-paper/40">{footer}</div>}
      </motion.div>
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
