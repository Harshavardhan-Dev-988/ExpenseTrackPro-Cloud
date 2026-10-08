/**
 * In-app confirmation dialog — the replacement for the browser's native
 * `confirm()` box, which can't be styled, blocks the whole tab, and on some
 * browsers shows the site's URL as its title.
 *
 *   const confirm = useConfirm();
 *   await confirm({
 *     title: 'Delete this expense?',
 *     message: 'This can't be undone.',
 *     confirmLabel: 'Delete',
 *     tone: 'danger',
 *     onConfirm: () => deleteExpense(id),   // dialog shows "Deleting…" until it settles
 *   });
 *
 * With `onConfirm`, the dialog stays open (button spinner, Cancel disabled)
 * until the action finishes; if it throws, the error is shown inside the
 * dialog so the person can retry or back out. Resolves `true` only once the
 * action has succeeded (or immediately on confirm, when there's no action).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { errorMessage } from './toastContext';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirmContext';

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const close = useCallback(
    (result: boolean) => {
      setPending((current) => {
        current?.resolve(result);
        return null;
      });
    },
    []
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>{pending && <ConfirmDialog key="confirm" options={pending} onClose={close} />}</AnimatePresence>
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: PendingConfirm; onClose: (result: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  const danger = (options.tone ?? 'danger') === 'danger';

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    // Destructive dialogs open with focus on Cancel, so a stray Enter
    // doesn't delete anything.
    (danger ? cancelRef : confirmRef).current?.focus();
    return () => {
      if (restoreFocusTo.current instanceof HTMLElement) restoreFocusTo.current.focus();
    };
  }, [danger]);

  const handleConfirm = async () => {
    if (!options.onConfirm) {
      onClose(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await options.onConfirm();
      onClose(true);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onClose(false);
    }
    // Two focusable buttons — keep Tab cycling between them.
    if (e.key === 'Tab') {
      const order = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      const idx = order.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      const next = e.shiftKey ? (idx <= 0 ? order.length - 1 : idx - 1) : (idx + 1) % order.length;
      order[next]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4" onKeyDown={handleKeyDown}>
      <motion.div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !busy && onClose(false)}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? 'confirm-message' : undefined}
        className="relative w-full max-w-md card-surface shadow-ledger-lg p-6"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-start gap-4">
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              danger ? 'bg-ember/12 text-ember-strong dark:text-ember' : 'bg-pine/12 text-pine-strong dark:text-pine'
            }`}
            aria-hidden="true"
          >
            {danger ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="font-display text-lg font-semibold text-ink leading-snug">
              {options.title}
            </h2>
            {options.message && (
              <div id="confirm-message" className="text-sm text-slate mt-1.5">
                {options.message}
              </div>
            )}
          </div>
        </div>

        {options.details && <div className="mt-4 rounded-lg border border-line bg-paper px-4 py-3">{options.details}</div>}

        {error && (
          <p className="mt-4 text-sm text-ember-strong dark:text-ember bg-ember/10 border border-ember/25 rounded-lg px-3 py-2" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(false)}
            disabled={busy}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-paper shadow-ledger transition-colors disabled:cursor-wait ${
              danger ? 'bg-ember hover:bg-ember-strong' : 'bg-pine hover:bg-pine-strong'
            } ${busy ? 'opacity-80' : ''}`}
          >
            {busy && <span className="h-4 w-4 rounded-full border-2 border-paper/40 border-t-paper animate-spin" aria-hidden="true" />}
            {busy ? options.busyLabel ?? 'Working…' : options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
