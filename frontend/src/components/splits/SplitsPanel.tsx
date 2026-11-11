/** "Split & settle up" — who owes whom across shared expenses, suggested
 * payments to square up, and recording them. */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { Balances } from '../../types';
import { formatMoney } from '../../utils/helpers';
import { useHousehold } from '../household/householdContext';
import Modal, { Section, btnGhost, btnPrimary, btnSecondary, inputCls } from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { errorMessage, useToast } from '../ui/toastContext';

export default function SplitsPanel({ currency, onClose }: { currency: string; onClose: () => void }) {
  const hh = useHousehold();
  const toast = useToast();
  const [data, setData] = useState<Balances | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ from: string; to: string; amount: string } | null>(null);
  const money = (n: number) => formatMoney(n, currency);

  const load = () => cloudApi.getBalances().then(setData).catch((err) => toast.error("Couldn't load balances", errorMessage(err)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (ref: string) => hh.personName(ref);
  const record = async (from: string, to: string, amount: number) => {
    setBusy(`${from}>${to}`);
    try {
      await cloudApi.settle(from, to, amount);
      toast.success('Payment recorded', `${name(from)} paid ${name(to)} ${money(amount)}`);
      setCustom(null);
      await load();
    } catch (err) {
      toast.error("Couldn't record it", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const people = data?.people ?? [];
  const everyone = Array.from(new Set([...people.map((p) => p.ref), ...hh.members.map((m) => `m:${m.userId}`)]));

  return (
    <Modal
      title="Split & settle up"
      eyebrow={hh.ledger.name}
      subtitle={data ? `${data.splitExpenses} shared ${data.splitExpenses === 1 ? 'expense' : 'expenses'}` : 'Loading…'}
      onClose={onClose}
      width="max-w-xl"
    >
      {!data ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : data.splitExpenses === 0 && data.settlements.length === 0 ? (
        <div className="text-center py-8">
          <p className="font-display text-lg text-ink mb-1">Nothing shared yet</p>
          <p className="text-sm text-slate max-w-sm mx-auto">
            When you add an expense, tick “Split this expense” to share it with household members or friends. Balances
            show up here.
          </p>
        </div>
      ) : (
        <>
          <Section title="Balances">
            {people.length === 0 ? (
              <p className="text-sm text-pine-strong dark:text-pine">Everyone is square. ✓</p>
            ) : (
              <ul className="space-y-1.5">
                {people.map((p) => (
                  <li key={p.ref} className="flex items-center justify-between rounded-lg bg-surface border border-line px-3 py-2">
                    <span className="text-sm text-ink">{name(p.ref)}</span>
                    <span className={`text-sm font-mono tabular ${p.net > 0 ? 'text-pine-strong dark:text-pine' : 'text-ember-strong dark:text-ember'}`}>
                      {p.net > 0
                        ? `${name(p.ref) === 'You' ? 'get' : 'gets'} back ${money(p.net)}`
                        : `${name(p.ref) === 'You' ? 'owe' : 'owes'} ${money(-p.net)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {data.transfers.length > 0 && (
            <Section title="To square up">
              <ul className="space-y-2">
                {data.transfers.map((t) => (
                  <li key={`${t.fromPerson}>${t.toPerson}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-brass/40 bg-brass/8 px-3 py-2.5">
                    <span className="flex-1 text-sm text-ink">
                      <b>{name(t.fromPerson)}</b> {name(t.fromPerson) === 'You' ? 'pay' : 'pays'}{' '}
                      <b>{name(t.toPerson) === 'You' ? 'you' : name(t.toPerson)}</b>{' '}
                      <span className="font-mono">{money(t.amount)}</span>
                    </span>
                    {hh.canEdit && (
                      <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => record(t.fromPerson, t.toPerson, t.amount)}>
                        {busy === `${t.fromPerson}>${t.toPerson}` ? <Spinner size="sm" /> : 'Mark as paid'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {hh.canEdit && (
            <Section
              title="Record another payment"
              action={!custom ? (
                <button type="button" className={btnGhost} onClick={() => setCustom({ from: everyone[0] ?? '', to: everyone[1] ?? '', amount: '' })}>
                  + Record
                </button>
              ) : undefined}
            >
              {custom ? (
                <form
                  className="flex flex-wrap items-center gap-2 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amt = Number(custom.amount);
                    if (amt > 0 && custom.from && custom.to && custom.from !== custom.to) record(custom.from, custom.to, amt);
                  }}
                >
                  <select className="rounded-md border border-line bg-surface px-2 py-1.5" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Who paid">
                    {everyone.map((r) => <option key={r} value={r}>{name(r)}</option>)}
                  </select>
                  <span className="text-slate">paid</span>
                  <select className="rounded-md border border-line bg-surface px-2 py-1.5" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Who received">
                    {everyone.map((r) => <option key={r} value={r}>{name(r)}</option>)}
                  </select>
                  <input className={`${inputCls} !w-28`} type="number" min="0" step="0.01" placeholder="₹" value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} aria-label="Amount" />
                  <button type="submit" className={btnPrimary} disabled={!!busy}>Save</button>
                  <button type="button" className={btnGhost} onClick={() => setCustom(null)}>Cancel</button>
                </form>
              ) : (
                <p className="text-xs text-slate">For payments that don't match a suggestion, e.g. a partial repayment.</p>
              )}
            </Section>
          )}

          {data.settlements.length > 0 && (
            <Section title="Payments recorded">
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {data.settlements.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 text-ink">
                      {name(s.fromPerson)} → {name(s.toPerson)}
                      <span className="block text-xs text-slate">{format(new Date(s.date), 'd MMM yyyy')}{s.note ? ` · ${s.note}` : ''}</span>
                    </span>
                    <span className="font-mono tabular">{money(s.amount)}</span>
                    {hh.canEdit && (
                      <button type="button" className={btnGhost} disabled={!!busy}
                        onClick={async () => {
                          setBusy(s.id);
                          try { await cloudApi.undoSettlement(s.id); await load(); } catch (err) { toast.error("Couldn't undo it", errorMessage(err)); } finally { setBusy(null); }
                        }}>
                        Undo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Modal>
  );
}
