/**
 * "Recurring expenses" — rent, salaries, EMIs, school fees, SIPs. Set once;
 * the server logs each one on its due date (or waits for a tap, for the
 * ones that vary month to month).
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { Frequency, RecurringInput, RecurringRule } from '../../types';
import { categoryLabel } from '../../utils/categoryRegistry';
import { PAYMENT_METHOD_LABELS } from '../../utils/constants';
import { formatMoney } from '../../utils/helpers';
import { omit } from '../../utils/omit';
import { useHousehold, memberLabel } from '../household/householdContext';
import CategorySelect from '../ui/CategorySelect';
import Modal, { Section, btnGhost, btnPrimary, btnSecondary, inputCls, labelCls } from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { useConfirm } from '../ui/confirmContext';
import { errorMessage, useToast } from '../ui/toastContext';
import { WEEKDAYS, dueText, scheduleText } from './recurringText';

interface Props {
  currency: string;
  onClose: () => void;
  /** Something was logged: the expense list should reload. */
  onLogged: () => void;
}

const TEMPLATES: { label: string; category: string; frequency: Frequency; day?: number; autoLog?: boolean }[] = [
  { label: 'Rent', category: 'rent_mortgage', frequency: 'monthly', day: 5 },
  { label: 'Maid salary', category: 'domestic_help_maid', frequency: 'monthly', day: 1 },
  { label: 'Cook salary', category: 'domestic_help_cook', frequency: 'monthly', day: 1 },
  { label: 'Driver salary', category: 'domestic_help_driver', frequency: 'monthly', day: 1 },
  { label: 'School fees', category: 'school_fees', frequency: 'quarterly', day: 10 },
  { label: 'Electricity bill', category: 'bills_power', frequency: 'monthly', day: 15, autoLog: false },
  { label: 'Internet', category: 'bills_wifi', frequency: 'monthly', day: 7 },
  { label: 'SIP', category: 'investments_savings', frequency: 'monthly', day: 10 },
  { label: 'Health insurance', category: 'medical_insurance', frequency: 'yearly' },
];

const today = () => format(new Date(), 'yyyy-MM-dd');

function blank(): RecurringInput {
  return {
    description: '',
    amount: 0,
    category: 'rent_mortgage',
    frequency: 'monthly',
    dayOfMonth: new Date().getDate(),
    startDate: today(),
    autoLog: true,
    active: true,
  };
}

/** Rough monthly cost, for the header. */
function perMonth(r: RecurringRule): number {
  const f = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency];
  return r.amount * f;
}

function describe(r: RecurringRule): string {
  if (r.frequency === 'yearly' && r.nextDue) return `Every year on ${format(parseISO(r.nextDue), 'd MMMM')}`;
  return scheduleText(r);
}

export default function RecurringManager({ currency, onClose, onLogged }: Props) {
  const hh = useHousehold();
  const toast = useToast();
  const confirm = useConfirm();
  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);
  const [form, setForm] = useState<RecurringInput>(blank);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    cloudApi
      .listRecurring()
      .then(setRules)
      .catch((err) => {
        toast.error("Couldn't load recurring expenses", errorMessage(err));
        setRules([]);
      });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (n: number) => formatMoney(n, currency);
  const active = useMemo(() => (rules ?? []).filter((r) => r.active), [rules]);
  const monthly = active.reduce((s, r) => s + perMonth(r), 0);

  const open = (rule: RecurringRule | 'new', template?: (typeof TEMPLATES)[number]) => {
    setEditing(rule);
    if (rule === 'new') {
      const b = blank();
      setForm(
        template
          ? { ...b, description: template.label, category: template.category, frequency: template.frequency,
              dayOfMonth: template.day ?? b.dayOfMonth, autoLog: template.autoLog ?? true }
          : b
      );
    } else {
      setForm(omit(rule, ['id', 'nextDue', 'lastLoggedDue', 'createdBy', 'createdAt', 'updatedAt']));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: RecurringInput = {
        ...form,
        amount: Number(form.amount),
        dayOfMonth: form.frequency === 'weekly' ? undefined : form.dayOfMonth,
        weekday: form.frequency === 'weekly' ? form.weekday ?? 0 : undefined,
        endDate: form.endDate || undefined,
        paidBy: form.paidBy || undefined,
      };
      if (editing === 'new') {
        const created = await cloudApi.createRecurring(body);
        toast.success('Recurring expense added', `${created.description} · next on ${dueText(created.nextDue)}`);
      } else if (editing) {
        await cloudApi.updateRecurring(editing.id, body);
        toast.success('Changes saved');
      }
      setEditing(null);
      await load();
      await hh.refreshDue().catch(() => undefined);
    } catch (err) {
      toast.error("Couldn't save it", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      await load();
      await hh.refreshDue().catch(() => undefined);
    } catch (err) {
      toast.error("That didn't work", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: RecurringRule) => {
    const ok = await confirm({
      title: `Delete “${r.description}”?`,
      message: 'It stops being logged. Expenses it already logged stay in your ledger.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (ok) await act(`del-${r.id}`, () => cloudApi.deleteRecurring(r.id), 'Recurring expense deleted');
  };

  const set = <K extends keyof RecurringInput>(k: K, v: RecurringInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.description.trim() && Number(form.amount) > 0 && form.startDate;

  return (
    <Modal
      title="Recurring expenses"
      eyebrow={hh.ledger.name}
      subtitle={
        rules === null ? 'Loading…' : active.length ? `${active.length} active · about ${money(Math.round(monthly))} a month` : 'Rent, salaries, EMIs, fees — set them once'
      }
      headerAction={
        hh.canEdit && editing === null ? (
          <button type="button" className={btnPrimary} onClick={() => open('new')}>
            + Add
          </button>
        ) : undefined
      }
      onClose={onClose}
      width="max-w-2xl"
    >
      {editing !== null && (
        <form
          className="rounded-xl border border-pine/40 bg-pine/5 p-4 mb-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save();
          }}
        >
          <div className="grid sm:grid-cols-[1fr_9rem] gap-3">
            <div>
              <label className={labelCls} htmlFor="rec-desc">What</label>
              <input id="rec-desc" className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Rent" autoFocus />
            </div>
            <div>
              <label className={labelCls} htmlFor="rec-amount">Amount</label>
              <input id="rec-amount" type="number" min="0" step="1" inputMode="decimal" className={inputCls} value={form.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} placeholder="18000" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="rec-cat">Category</label>
              <CategorySelect id="rec-cat" className={inputCls} value={form.category} onChange={(v) => set('category', v)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rec-pm">Paid with</label>
              <select id="rec-pm" className={inputCls} value={form.paymentMethod ?? ''} onChange={(e) => set('paymentMethod', e.target.value || undefined)}>
                <option value="">—</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="rec-freq">How often</label>
              <select id="rec-freq" className={inputCls} value={form.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="quarterly">Every 3 months</option>
                <option value="yearly">Every year</option>
              </select>
            </div>
            {form.frequency === 'weekly' ? (
              <div>
                <label className={labelCls} htmlFor="rec-wd">On</label>
                <select id="rec-wd" className={inputCls} value={form.weekday ?? 0} onChange={(e) => set('weekday', Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls} htmlFor="rec-dom">On day</label>
                <select id="rec-dom" className={inputCls} value={form.dayOfMonth ?? 1} onChange={(e) => set('dayOfMonth', Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d === 31 ? '31 / last day' : d}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="rec-start">Starting</label>
              <input id="rec-start" type="date" className={inputCls} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="rec-end">Until (optional)</label>
              <input id="rec-end" type="date" className={inputCls} value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || undefined)} />
            </div>
            {hh.isShared && (
              <div>
                <label className={labelCls} htmlFor="rec-paid">Usually paid by</label>
                <select id="rec-paid" className={inputCls} value={form.paidBy ?? ''} onChange={(e) => set('paidBy', e.target.value || undefined)}>
                  <option value="">—</option>
                  {hh.members.map((m) => (
                    <option key={m.userId} value={`m:${m.userId}`}>{m.userId === hh.me.userId ? 'You' : memberLabel(m)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2.5 text-sm text-ink cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[rgb(var(--pine))]" checked={form.autoLog} onChange={(e) => set('autoLog', e.target.checked)} />
            <span>
              Log it automatically on the due date
              <span className="block text-xs text-slate">Untick for bills that change each time — you'll be asked to confirm the amount.</span>
            </span>
          </label>
          <p className="text-xs text-slate font-mono">{scheduleText(form)}{form.endDate ? ` until ${dueText(form.endDate)}` : ''}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={!valid || saving}>
              {saving ? <Spinner size="sm" tone="paper" /> : editing === 'new' ? 'Add recurring expense' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {hh.due.length > 0 && (
        <Section title="Waiting for you">
          <ul className="space-y-2">
            {hh.due.map((d) => (
              <li key={d.ruleId} className="flex flex-wrap items-center gap-2 rounded-xl border border-brass/40 bg-brass/8 px-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink">{d.description}</span>
                  <span className="block text-xs text-slate">
                    Due {dueText(d.dates[0])}{d.dates.length > 1 ? ` (+${d.dates.length - 1} more)` : ''} · {money(d.amount)}
                  </span>
                </span>
                {hh.canEdit && (
                  <>
                    <button type="button" className={btnSecondary} disabled={!!busy}
                      onClick={() => act(`log-${d.ruleId}`, async () => { await cloudApi.logRecurring(d.ruleId, d.dates[0]); onLogged(); }, `${d.description} logged`)}>
                      {busy === `log-${d.ruleId}` ? <Spinner size="sm" /> : 'Log it'}
                    </button>
                    <button type="button" className={btnGhost} disabled={!!busy}
                      onClick={() => act(`skip-${d.ruleId}`, () => cloudApi.skipRecurring(d.ruleId, d.dates[0]), 'Skipped this time')}>
                      Skip
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={rules && rules.length ? 'All recurring' : 'Start with one of these'}>
        {rules === null ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : rules.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" disabled={!hh.canEdit} onClick={() => open('new', t)}
                className="px-3 py-1.5 rounded-full border border-line bg-surface text-sm text-ink hover:border-pine hover:text-pine-strong disabled:opacity-50">
                + {t.label}
              </button>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {rules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-3 ${r.active ? '' : 'opacity-60'}`}>
                <span className="flex-1 min-w-[12rem]">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{r.description}</span>
                    {!r.active && <span className="text-[10px] font-mono uppercase bg-paper text-slate rounded px-1.5 py-0.5">paused</span>}
                    {r.active && !r.autoLog && <span className="text-[10px] font-mono uppercase bg-brass/15 text-brass-strong dark:text-brass rounded px-1.5 py-0.5">asks first</span>}
                  </span>
                  <span className="block text-xs text-slate">
                    {describe(r)} · {categoryLabel(r.category)}
                    {r.paidBy && hh.isShared ? ` · ${hh.personName(r.paidBy)}` : ''}
                  </span>
                  {r.active && r.nextDue && <span className="block text-xs text-pine-strong dark:text-pine">Next: {dueText(r.nextDue)}</span>}
                </span>
                <span className="font-mono tabular text-sm font-semibold text-ink">{money(r.amount)}</span>
                {hh.canEdit && (
                  <span className="flex gap-1">
                    <button type="button" className={btnGhost} onClick={() => open(r)}>Edit</button>
                    <button type="button" className={btnGhost} disabled={busy === `pause-${r.id}`}
                      onClick={() => act(`pause-${r.id}`, () => cloudApi.updateRecurring(r.id, { active: !r.active }), r.active ? 'Paused' : 'Resumed')}>
                      {r.active ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" className={btnGhost} onClick={() => remove(r)}>Delete</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Modal>
  );
}
