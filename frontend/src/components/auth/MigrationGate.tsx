/**
 * One-time local-to-cloud data migration, run once per (browser, Cognito
 * user) pair right after sign-in and before the rest of the app mounts.
 *
 * `services/db.ts` (IndexedDB) is still on disk and untouched — it's the
 * source for this one read, nothing else in the app imports it anymore
 * (everything else now goes through `services/cloudApi.ts`). We check it
 * once, offer to copy anything found up to the user's new cloud account,
 * and remember (in localStorage, keyed by the signed-in user's id so a
 * second account on the same browser gets its own check) that this
 * device/user pair has already been asked, so it doesn't ask again on
 * every load.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import localDb from '../../services/db';
import cloudApi, { mapWithConcurrency } from '../../services/cloudApi';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200';

type Status = 'checking' | 'prompt' | 'importing' | 'done' | 'error';

interface LocalSnapshot {
  expenses: Awaited<ReturnType<typeof localDb.getAllExpenses>>;
  budgets: Awaited<ReturnType<typeof localDb.getAllBudgets>>;
  settings: Awaited<ReturnType<typeof localDb.getSettings>>;
  savings: Awaited<ReturnType<typeof localDb.getAllSavings>>;
  savingsGoals: Awaited<ReturnType<typeof localDb.getAllSavingsGoals>>;
}

function migrationFlagKey(userId: string) {
  return `etp:migrated:${userId}`;
}

async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const [expenses, budgets, settings, savings, savingsGoals] = await Promise.all([
    localDb.getAllExpenses(),
    localDb.getAllBudgets(),
    localDb.getSettings(),
    localDb.getAllSavings(),
    localDb.getAllSavingsGoals(),
  ]);
  return { expenses, budgets, settings, savings, savingsGoals };
}

function isEmpty(snapshot: LocalSnapshot): boolean {
  return (
    snapshot.expenses.length === 0 &&
    snapshot.budgets.length === 0 &&
    !snapshot.settings &&
    snapshot.savings.length === 0 &&
    snapshot.savingsGoals.length === 0
  );
}

interface Props {
  userId: string;
  children: ReactNode;
}

export default function MigrationGate({ userId, children }: Props) {
  const [status, setStatus] = useState<Status>('checking');
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (localStorage.getItem(migrationFlagKey(userId)) === '1') {
        if (!cancelled) setStatus('done');
        return;
      }

      try {
        const found = await readLocalSnapshot();
        if (cancelled) return;

        if (isEmpty(found)) {
          localStorage.setItem(migrationFlagKey(userId), '1');
          setStatus('done');
        } else {
          setSnapshot(found);
          setStatus('prompt');
        }
      } catch (err) {
        if (!cancelled) {
          // Reading the old local database failed (e.g. a private/locked-down
          // browser context) - that's not worth blocking sign-in over, so
          // just proceed without offering a migration.
          console.error('Migration: failed to read local data', err);
          localStorage.setItem(migrationFlagKey(userId), '1');
          setStatus('done');
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const runImport = async () => {
    if (!snapshot) return;
    setStatus('importing');
    setErrorMessage(null);

    try {
      if (snapshot.settings) {
        await cloudApi.saveSettings(snapshot.settings);
      }
      if (snapshot.expenses.length > 0) {
        await cloudApi.addExpenses(snapshot.expenses);
      }
      await mapWithConcurrency(snapshot.budgets, 5, (budget) => cloudApi.saveBudget(budget));
      await mapWithConcurrency(snapshot.savings, 5, (entry) => cloudApi.addSavings(entry));
      await mapWithConcurrency(snapshot.savingsGoals, 5, (goal) => cloudApi.addSavingsGoal(goal));

      localStorage.setItem(migrationFlagKey(userId), '1');
      setStatus('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed');
      setStatus('error');
    }
  };

  const skip = () => {
    localStorage.setItem(migrationFlagKey(userId), '1');
    setStatus('done');
  };

  if (status === 'done') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
          <p className="mt-4 text-sm text-slate font-mono">checking for existing data…</p>
        </div>
      </div>
    );
  }

  if (status === 'importing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-line border-t-pine animate-spin" />
          <p className="mt-4 text-sm text-slate font-mono">importing your data…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-center p-8 card-surface max-w-lg">
          <h2 className="text-2xl font-display font-semibold text-ember mb-4">Import didn't finish</h2>
          <p className="text-slate mb-6">{errorMessage}</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={runImport} className={btnPrimary}>Try again</button>
            <button onClick={skip} className={btnSecondary}>Skip for now</button>
          </div>
        </div>
      </div>
    );
  }

  // status === 'prompt'
  const s = snapshot!;
  const parts = [
    s.expenses.length > 0 ? `${s.expenses.length} expense${s.expenses.length === 1 ? '' : 's'}` : null,
    s.budgets.length > 0 ? `${s.budgets.length} budget${s.budgets.length === 1 ? '' : 's'}` : null,
    s.savings.length > 0 ? `${s.savings.length} savings ${s.savings.length === 1 ? 'entry' : 'entries'}` : null,
    s.savingsGoals.length > 0 ? `${s.savingsGoals.length} savings goal${s.savingsGoals.length === 1 ? '' : 's'}` : null,
    s.settings ? 'your saved settings' : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="text-center p-8 card-surface max-w-lg">
        <h2 className="text-2xl font-display font-semibold text-ink mb-4">Bring your data along?</h2>
        <p className="text-slate mb-6">
          We found {parts.join(', ')} saved on this device. Import it into your account so it's
          there whenever you sign in, on any device?
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={runImport} className={btnPrimary}>Import now</button>
          <button onClick={skip} className={btnSecondary}>Skip, start fresh</button>
        </div>
      </div>
    </div>
  );
}
