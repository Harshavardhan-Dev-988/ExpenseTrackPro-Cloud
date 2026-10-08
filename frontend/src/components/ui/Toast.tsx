/**
 * App-wide status toasts.
 *
 * One small stack in the corner (bottom-centre on phones) that every part of
 * the app reports into: "entry recorded", "export downloaded", "couldn't
 * delete that — try again". Replaces the scattered browser `alert()` calls,
 * which block the page and can't be styled.
 *
 * `loading` toasts stay up until they're updated or dismissed, so a long
 * job (a 1,500-row import, a PDF build) can show progress in place and then
 * turn into its own success/error message:
 *
 *   const id = toast.loading('Importing…');
 *   toast.update(id, { description: '120 of 500' });
 *   toast.update(id, { kind: 'success', title: 'Imported 500 expenses' });
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContext, type ToastApi, type ToastItem, type ToastKind } from './toastContext';

type ToastInput = Omit<ToastItem, 'id'>;

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  error: 6500,
  loading: 0,
};

const MAX_VISIBLE = 4;

let counter = 0;
const nextId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (toast: ToastItem) => {
      const existing = timers.current.get(toast.id);
      if (existing) clearTimeout(existing);
      timers.current.delete(toast.id);
      const duration = toast.duration ?? DEFAULT_DURATION[toast.kind];
      if (duration > 0) {
        timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), duration));
      }
    },
    [dismiss]
  );

  const show = useCallback(
    (input: ToastInput) => {
      const toast: ToastItem = { ...input, id: nextId() };
      setToasts((prev) => [...prev, toast].slice(-MAX_VISIBLE));
      schedule(toast);
      return toast.id;
    },
    [schedule]
  );

  const update = useCallback(
    (id: string, patch: Partial<ToastInput>) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          // Only (re)start the auto-dismiss clock when the kind changes —
          // a stream of progress updates on a loading toast shouldn't keep
          // resetting anything.
          if (patch.kind && patch.kind !== t.kind) schedule(next);
          return next;
        })
      );
    },
    [schedule]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      update,
      dismiss,
      success: (title, description) => show({ kind: 'success', title, description }),
      error: (title, description) => show({ kind: 'error', title, description }),
      info: (title, description) => show({ kind: 'info', title, description }),
      loading: (title, description) => show({ kind: 'loading', title, description }),
    }),
    [show, update, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'loading') {
    return <span className="block h-4 w-4 rounded-full border-2 border-line border-t-pine animate-spin" aria-hidden="true" />;
  }
  const paths: Record<Exclude<ToastKind, 'loading'>, string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={paths[kind]} />
    </svg>
  );
}

const ICON_WRAP: Record<ToastKind, string> = {
  success: 'bg-pine/12 text-pine-strong dark:text-pine',
  error: 'bg-ember/12 text-ember-strong dark:text-ember',
  info: 'bg-brass/12 text-brass-strong dark:text-brass',
  loading: 'bg-paper',
};

const ACCENT: Record<ToastKind, string> = {
  success: 'before:bg-pine',
  error: 'before:bg-ember',
  info: 'before:bg-brass',
  loading: 'before:bg-line',
};

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="fixed z-[90] bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 sm:bottom-5 flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            role={toast.kind === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-auto relative overflow-hidden sm:w-[360px] card-surface shadow-ledger-lg pl-4 pr-2 py-3 flex items-start gap-3
              before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${ACCENT[toast.kind]}`}
          >
            <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${ICON_WRAP[toast.kind]}`}>
              <ToastIcon kind={toast.kind} />
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-ink leading-snug">{toast.title}</p>
              {toast.description && <div className="text-xs text-slate mt-0.5 break-words">{toast.description}</div>}
            </div>
            {toast.kind !== 'loading' && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="p-1.5 -mt-0.5 rounded-md text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
                aria-label="Dismiss notification"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
