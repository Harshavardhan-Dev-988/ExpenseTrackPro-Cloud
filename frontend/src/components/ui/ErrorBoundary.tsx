/**
 * Catches render/lifecycle errors anywhere below it in the tree so one
 * broken component (a bad chart render, a malformed record from the API,
 * etc.) shows a recoverable screen instead of leaving the user staring at
 * a blank white page with no way back in.
 *
 * React only supports this via a class component - there's no hook
 * equivalent for `getDerivedStateFromError`/`componentDidCatch` as of
 * React 19. Wrapping the whole app (see main.tsx) also gives every child
 * a shared fallback "for free"; a component that wants its own more
 * targeted recovery can nest another instance of this closer to itself.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry endpoint yet (see the roadmap's monitoring/alarms work,
    // which covers the backend side) - for now this is at least visible in
    // the browser console rather than silently swallowed.
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-paper px-4">
          <div className="text-center p-8 card-surface max-w-lg">
            <h2 className="text-2xl font-display font-semibold text-ember mb-4">
              Something went wrong
            </h2>
            <p className="text-slate mb-2">
              A part of the app hit an unexpected error. Your data is safe - this is a display
              problem, not a data-loss one.
            </p>
            <p className="text-xs text-slate font-mono mb-6 break-words">
              {this.state.error.message}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={this.reset} className={btnPrimary}>
                Try again
              </button>
              <button onClick={() => window.location.reload()} className={btnSecondary}>
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
