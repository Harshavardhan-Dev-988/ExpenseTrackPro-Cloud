/** Invitations to other households, shown at the top of the app. */
import { useState } from 'react';
import cloudApi from '../../services/cloudApi';
import Spinner from '../ui/Spinner';
import { errorMessage, useToast } from '../ui/toastContext';
import { ROLE_LABEL, useHousehold } from './householdContext';

export default function InviteBanner() {
  const hh = useHousehold();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const banners = [];
  for (const inv of hh.me.invites) {
    const act = async (accept: boolean) => {
      setBusy(inv.ledgerId + accept);
      try {
        if (accept) {
          await cloudApi.acceptInvite(inv.ledgerId);
          await hh.refresh();
          toast.success(`You joined ${inv.ledgerName ?? 'the household'}`, 'Switching to it now.');
          hh.switchLedger(inv.ledgerId);
        } else {
          await cloudApi.declineInvite(inv.ledgerId);
          await hh.refresh();
        }
      } catch (err) {
        toast.error("Couldn't answer the invite", errorMessage(err));
      } finally {
        setBusy(null);
      }
    };
    banners.push(
      <div key={inv.ledgerId} className="card-surface mb-4 p-3.5 border-l-4 border-l-pine flex flex-col sm:flex-row sm:items-center gap-3" role="status">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">
            {inv.invitedByName ?? 'Someone'} invited you to <span className="text-pine-strong dark:text-pine">{inv.ledgerName ?? 'their household'}</span>
          </p>
          <p className="text-xs text-slate mt-0.5">
            As “{ROLE_LABEL[inv.role].toLowerCase()}” — you'll see its expenses, budgets and recurring bills, and can switch
            between households from the menu.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => act(true)}
            disabled={!!busy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong disabled:opacity-60"
          >
            {busy === inv.ledgerId + 'true' ? <Spinner size="sm" tone="paper" /> : null}
            Join
          </button>
          <button
            type="button"
            onClick={() => act(false)}
            disabled={!!busy}
            className="px-3.5 py-2 rounded-lg border border-line bg-surface text-sm text-ink hover:border-pine disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {banners}
      {!hh.canEdit && (
        <div className="mb-4 rounded-xl bg-brass/10 border border-brass/30 px-3.5 py-2.5 text-sm text-ink" role="status">
          You have <b>view-only</b> access to {hh.ledger.name}. Ask its owner if you need to add or change entries.
        </div>
      )}
    </>
  );
}
