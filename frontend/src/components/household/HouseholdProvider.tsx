import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import cloudApi, { setCurrentLedger } from '../../services/cloudApi';
import type { DueItem, Me, Member, Preferences } from '../../types';
import Spinner from '../ui/Spinner';
import { errorMessage } from '../ui/toastContext';
import { HouseholdContext, memberLabel, type HouseholdContextValue } from './householdContext';

const storageKey = (userId: string) => `etp:ledger:${userId}`;

function remembered(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function remember(userId: string, ledgerId: string) {
  try {
    localStorage.setItem(storageKey(userId), ledgerId);
  } catch {
    /* per-browser convenience only */
  }
}

/** Waits for a promise, but never longer than `ms` (resolves to undefined). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

export default function HouseholdProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [autoLogged, setAutoLogged] = useState(0);
  // The household whose members/recurring have loaded (ready when it's the current one).
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const data = await cloudApi.getMe();
    setMe(data);
    return data;
  }, []);

  // First load: who am I, which household.
  useEffect(() => {
    let cancelled = false;
    cloudApi
      .getMe()
      .then((data) => {
        if (cancelled) return;
        setMe(data);
        const ids = data.ledgers.map((l) => l.id);
        const saved = remembered(data.userId);
        setLedgerId(saved && ids.includes(saved) ? saved : data.defaultLedgerId);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Each time the household changes: point the API at it, load members,
  // and log any recurring expenses that fell due (before the app loads its
  // data, so they show up straight away; capped so a slow call can't hold
  // the app back).
  useEffect(() => {
    if (!ledgerId || !me) return;
    let cancelled = false;
    setCurrentLedger(ledgerId);
    remember(me.userId, ledgerId);
    Promise.all([
      cloudApi.listMembers(ledgerId).catch(() => [] as Member[]),
      withTimeout(cloudApi.runRecurring().catch(() => undefined), 4000),
    ]).then(([m, run]) => {
      if (cancelled) return;
      setMembers(m);
      setDue(run?.due ?? []);
      setAutoLogged(run?.logged ?? 0);
      setReadyFor(ledgerId);
    });
    return () => {
      cancelled = true;
    };
    // me.userId is stable for the session; re-running on every /me refresh isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId, me?.userId]);

  const refresh = useCallback(async () => {
    const data = await loadMe();
    if (ledgerId && !data.ledgers.some((l) => l.id === ledgerId)) setLedgerId(data.defaultLedgerId);
  }, [loadMe, ledgerId]);

  const value = useMemo<HouseholdContextValue | null>(() => {
    if (!me || !ledgerId) return null;
    const ledger = me.ledgers.find((l) => l.id === ledgerId) ?? me.ledgers[0];
    if (!ledger) return null;
    const byId = new Map(members.map((m) => [m.userId, memberLabel(m)]));
    const role = ledger.role;
    return {
      me,
      ledger,
      ledgers: me.ledgers,
      role,
      canEdit: role !== 'viewer',
      isOwner: role === 'owner',
      members,
      isShared: members.length > 1,
      due,
      autoLogged,
      switchLedger: (id: string) => setLedgerId(id),
      refresh,
      reloadMembers: async () => setMembers(await cloudApi.listMembers(ledger.id)),
      refreshDue: async () => {
        const run = await cloudApi.runRecurring();
        setDue(run.due);
      },
      updatePreferences: async (prefs: Partial<Preferences>) => {
        const saved = await cloudApi.updatePreferences(prefs);
        setMe((cur) => (cur ? { ...cur, preferences: saved } : cur));
      },
      personName: (ref: string) => {
        if (ref.startsWith('n:')) return ref.slice(2);
        const id = ref.startsWith('m:') ? ref.slice(2) : ref;
        if (id === me.userId) return 'You';
        return byId.get(id) ?? 'Former member';
      },
    };
  }, [me, ledgerId, members, due, autoLogged, refresh]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-center p-8 card-surface max-w-lg">
          <h2 className="text-2xl font-display font-semibold text-ember mb-3">Couldn't open your household</h2>
          <p className="text-slate mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }

  if (!value || readyFor !== ledgerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto" />
          <p className="mt-4 text-sm text-slate font-mono">{me ? `opening ${me.ledgers.find((l) => l.id === ledgerId)?.name ?? 'your ledger'}…` : 'opening your ledger…'}</p>
        </div>
      </div>
    );
  }

  return (
    <HouseholdContext.Provider value={value}>
      {/* key: switching household remounts the app so every hook reloads */}
      <div key={value.ledger.id} className="contents">
        {children}
      </div>
    </HouseholdContext.Provider>
  );
}
