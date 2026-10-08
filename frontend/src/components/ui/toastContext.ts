/**
 * Toast context, hook and error helper — kept apart from the provider
 * component (Toast.tsx) so fast refresh works on both. See Toast.tsx for
 * how the stack behaves.
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'loading';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: ReactNode;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Defaults by kind. */
  duration?: number;
}

type ToastInput = Omit<ToastItem, 'id'>;

export interface ToastApi {
  show: (toast: ToastInput) => string;
  success: (title: string, description?: ReactNode) => string;
  error: (title: string, description?: ReactNode) => string;
  info: (title: string, description?: ReactNode) => string;
  loading: (title: string, description?: ReactNode) => string;
  update: (id: string, patch: Partial<ToastInput>) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Pull a readable message out of whatever a failed call threw. */
export function errorMessage(err: unknown, fallback = 'Something went wrong — please try again.'): string {
  if (err instanceof Error && err.message) {
    // API errors carry status + raw body; the status line is what's useful.
    const api = err.message.match(/^API request failed: (\d+)/);
    if (api) {
      const status = Number(api[1]);
      if (status === 401 || status === 403) return 'Your session has expired — please sign in again.';
      if (status >= 500) return 'The server had a problem — please try again in a moment.';
      return `The request was rejected (${status}).`;
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
      return "Couldn't reach the server — check your connection.";
    }
    return err.message;
  }
  return fallback;
}
