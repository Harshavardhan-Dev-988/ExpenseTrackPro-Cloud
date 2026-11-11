/** Dashboard strip: recurring expenses waiting for confirmation, and what's
 * coming up in the next two weeks. Hidden when there are no recurring rules. */
import { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { RecurringRule } from '../../types';
import { formatMoney } from '../../utils/helpers';
import { useHousehold } from '../household/householdContext';
import Spinner from '../ui/Spinner';
import { errorMessage, useToast } from '../ui/toastContext';

interface Props {
  currency: string;
  onManage: () => void;
  onLogged: () => void;
  /** Bumped by the parent after the recurring manager changes something. */
  version: number;
}

function when(iso: string): string {
  const d = parseISO(iso);
  const n = differenceInCalendarDays(d, new Date());
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 7) return format(d, 'EEEE');
  return format(d, 'd MMM');
}

export default function DueSoon({ currency, onManage, onLogged, version }: Props) {
  const hh = useHousehold();
  const toast = useToast();
  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    cloudApi.listRecurring().then(setRules).catch(() => setRules([]));
  }, [version]);

  const upcoming = useMemo(() => {
    const horizon = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    const waiting = new Set(hh.due.map((d) => d.ruleId));
    return (rules ?? [])
      .filter((r) => r.active && r.nextDue && r.nextDue <= horizon && !waiting.has(r.id))
      .sort((a, b) => (a.nextDue! < b.nextDue! ? -1 : 1))
      .slice(0, 4);
  }, [rules, hh.due]);

  if (!rules || (rules.length === 0 && hh.due.length === 0)) return null;
  if (upcoming.length === 0 && hh.due.length === 0) return null;
  const money = (n: number) => formatMoney(n, currency);

  const log = async (ruleId: string, due: string, label: string) => {
    setBusy(ruleId);
    try {
      await cloudApi.logRecurring(ruleId, due);
      await hh.refreshDue();
      onLogged();
      toast.success(`${label} logged`);
    } catch (err) {
      toast.error("Couldn't log it", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card-surface mb-5 p-3.5 sm:p-4" data-snapshot-exclude>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate">Recurring · next two weeks</p>
        <button type="button" onClick={onManage} className="text-xs font-medium text-pine-strong dark:text-pine hover:underline">
          Manage
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {hh.due.map((d) => (
          <li key={d.ruleId} className="rounded-lg border border-brass/40 bg-brass/8 px-3 py-2 flex items-center gap-2">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-ink truncate">{d.description}</span>
              <span className="block text-xs text-brass-strong dark:text-brass">
                due {when(d.dates[0])} · {money(d.amount)}
              </span>
            </span>
            {hh.canEdit && (
              <button
                type="button"
                disabled={busy === d.ruleId}
                onClick={() => log(d.ruleId, d.dates[0], d.description)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-pine text-paper hover:bg-pine-strong disabled:opacity-60"
              >
                {busy === d.ruleId ? <Spinner size="sm" tone="paper" /> : 'Log'}
              </button>
            )}
          </li>
        ))}
        {upcoming.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-paper/60 px-3 py-2">
            <span className="block text-sm font-medium text-ink truncate">{r.description}</span>
            <span className="block text-xs text-slate">
              {when(r.nextDue!)} · {money(r.amount)}
              {r.autoLog ? '' : ' · asks first'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
