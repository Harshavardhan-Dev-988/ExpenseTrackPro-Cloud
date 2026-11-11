/**
 * Inside the expense form: who paid, and (optionally) how the cost is
 * shared — equally or in exact amounts — between household members and
 * anyone else (a friend on a trip). Shares always add up to the amount.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Split } from '../../types';
import { memberLabel, useHousehold } from '../household/householdContext';
import { equalShares, round2, splitTotal } from './splitMath';

export interface SplitValue {
  paidBy?: string;
  split?: Split;
}

interface Props {
  amount: number;
  value: SplitValue;
  onChange: (v: SplitValue) => void;
  error?: string;
}

export default function SplitEditor({ amount, value, onChange, error }: Props) {
  const hh = useHousehold();
  const me = `m:${hh.me.userId}`;
  const enabled = !!value.split;
  const people = useMemo(() => value.split?.shares.map((s) => s.person) ?? [], [value.split]);
  const isEqual = useMemo(() => {
    if (!value.split) return true;
    const eq = equalShares(amount, people);
    return eq.shares.every((s, i) => Math.abs(s.amount - (value.split!.shares[i]?.amount ?? -1)) < 0.011);
  }, [value.split, amount, people]);
  const [mode, setMode] = useState<'equal' | 'exact'>(isEqual ? 'equal' : 'exact');
  const [newPerson, setNewPerson] = useState('');

  // Equal splits follow the amount as it's typed.
  useEffect(() => {
    if (mode !== 'equal' || !value.split || !people.length) return;
    if (Math.abs(splitTotal(value.split) - amount) > 0.001) onChange({ ...value, split: equalShares(amount, people) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, mode]);

  const memberRefs = hh.members.map((m) => ({ ref: `m:${m.userId}`, label: m.userId === hh.me.userId ? 'You' : memberLabel(m) }));
  const others = people.filter((p) => p.startsWith('n:'));
  const paidBy = value.paidBy ?? me;

  const update = (nextPeople: string[], nextMode = mode, exact?: Split) => {
    const split = nextMode === 'equal' ? equalShares(amount, nextPeople) : exact ?? {
      shares: nextPeople.map((p) => ({ person: p, amount: value.split?.shares.find((s) => s.person === p)?.amount ?? 0 })),
    };
    onChange({ paidBy, split });
  };

  const toggle = (ref: string) => {
    const next = people.includes(ref) ? people.filter((p) => p !== ref) : [...people, ref];
    update(next);
  };

  const addPerson = () => {
    const name = newPerson.trim().replace(/^[mn]:/, '');
    if (!name) return;
    const ref = `n:${name.slice(0, 40)}`;
    if (!people.includes(ref)) update([...people, ref]);
    setNewPerson('');
  };

  const showPaidBy = hh.isShared || enabled;
  const remaining = round2(amount - splitTotal(value.split));

  return (
    <div className="rounded-xl border border-line bg-paper/50 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {showPaidBy && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <span className="text-[10px] uppercase tracking-wide text-slate font-mono">Paid by</span>
            <select
              id="expense-paid-by"
              value={paidBy}
              onChange={(e) => onChange({ ...value, paidBy: e.target.value })}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
            >
              {memberRefs.map((m) => (
                <option key={m.ref} value={m.ref}>{m.label}</option>
              ))}
              {others.map((o) => (
                <option key={o} value={o}>{o.slice(2)}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer ml-auto">
          <input
            id="expense-split-toggle"
            type="checkbox"
            className="accent-[rgb(var(--pine))]"
            checked={enabled}
            onChange={(e) => {
              if (e.target.checked) {
                const start = hh.isShared ? memberRefs.map((m) => m.ref) : [me];
                onChange({ paidBy, split: equalShares(amount, start) });
                setMode('equal');
              } else {
                onChange({ paidBy: hh.isShared ? paidBy : undefined, split: undefined });
              }
            }}
          />
          Split this expense
        </label>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {memberRefs.map((m) => {
              const on = people.includes(m.ref);
              return (
                <button
                  key={m.ref}
                  type="button"
                  onClick={() => toggle(m.ref)}
                  aria-pressed={on}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    on ? 'border-pine bg-pine/10 text-pine-strong dark:text-pine' : 'border-line text-slate hover:border-pine/50'
                  }`}
                >
                  {on ? '✓ ' : ''}{m.label}
                </button>
              );
            })}
            {others.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border border-pine bg-pine/10 text-pine-strong dark:text-pine"
                aria-label={`Remove ${o.slice(2)} from the split`}
              >
                ✓ {o.slice(2)} ×
              </button>
            ))}
            <span className="inline-flex items-center gap-1">
              <input
                id="split-add-person"
                value={newPerson}
                onChange={(e) => setNewPerson(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPerson();
                  }
                }}
                placeholder="+ someone else"
                className="w-32 px-2 py-1 rounded-full border border-dashed border-line bg-surface text-xs text-ink placeholder:text-slate/70 focus:outline-none focus:border-pine"
                aria-label="Add a person to the split"
              />
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {(['equal', 'exact'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  update(people, m);
                }}
                className={`px-2.5 py-1 rounded-md font-medium ${mode === m ? 'bg-pine text-paper' : 'bg-surface border border-line text-slate'}`}
              >
                {m === 'equal' ? 'Equally' : 'Exact amounts'}
              </button>
            ))}
            {people.length > 0 && mode === 'equal' && (
              <span className="text-slate">₹{round2(amount / people.length).toLocaleString('en-IN')} each</span>
            )}
          </div>

          {mode === 'exact' && (
            <div className="space-y-1.5">
              {(value.split?.shares ?? []).map((s, i) => (
                <div key={s.person} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-ink truncate">{s.person === me ? 'You' : hh.personName(s.person)}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={s.amount || ''}
                    onChange={(e) => {
                      const shares = [...(value.split?.shares ?? [])];
                      shares[i] = { ...s, amount: Number(e.target.value) || 0 };
                      onChange({ paidBy, split: { shares } });
                    }}
                    className="w-28 px-2 py-1 rounded-md border border-line bg-surface text-sm text-right font-mono"
                    aria-label={`Share for ${hh.personName(s.person)}`}
                  />
                </div>
              ))}
              <p className={`text-xs ${Math.abs(remaining) < 0.01 ? 'text-pine-strong dark:text-pine' : 'text-ember'}`}>
                {Math.abs(remaining) < 0.01 ? 'Shares add up ✓' : `${remaining > 0 ? 'Left to assign' : 'Over by'}: ₹${Math.abs(remaining).toLocaleString('en-IN')}`}
              </p>
            </div>
          )}
          {error && <p className="text-ember text-xs">{error}</p>}
        </>
      )}
    </div>
  );
}
