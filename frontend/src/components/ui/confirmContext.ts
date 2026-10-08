/**
 * Context + hook for the in-app confirmation dialog (ConfirmDialog.tsx),
 * kept in their own module so fast refresh works on the component file.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Optional summary card (e.g. the expense being deleted). */
  details?: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm?: () => Promise<unknown> | unknown;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
