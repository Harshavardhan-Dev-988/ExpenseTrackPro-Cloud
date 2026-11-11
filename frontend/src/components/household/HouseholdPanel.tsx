/**
 * "Household" — who shares this ledger, invites, roles, the year setting,
 * and switching between or creating households.
 */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { Invite, Role, Settings } from '../../types';
import Modal, { Section, btnDanger, btnGhost, btnPrimary, btnSecondary, inputCls } from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { useConfirm } from '../ui/confirmContext';
import { errorMessage, useToast } from '../ui/toastContext';
import { ROLE_HINT, ROLE_LABEL, memberLabel, useHousehold } from './householdContext';

interface Props {
  settings: Settings;
  onUpdateSettings: (s: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7AA891] to-[#2F4D3F] text-white font-display font-semibold text-sm flex items-center justify-center shrink-0" aria-hidden="true">
      {initials || '·'}
    </span>
  );
}

export default function HouseholdPanel({ settings, onUpdateSettings, onClose }: Props) {
  const hh = useHousehold();
  const { me, ledger, ledgers, members, isOwner, canEdit } = hh;
  const toast = useToast();
  const confirm = useConfirm();

  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(ledger.name);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    cloudApi.listInvites(ledger.id).then(setInvites).catch(() => setInvites([]));
  }, [isOwner, ledger.id]);

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
    } catch (err) {
      toast.error("That didn't work", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const invite = () =>
    run('invite', async () => {
      const created = await cloudApi.createInvite(ledger.id, email.trim(), inviteRole);
      setInvites((cur) => [created, ...(cur ?? []).filter((i) => i.email !== created.email)]);
      setEmail('');
      toast.success('Invite ready', `${created.email} will see it when they sign in with that email.`);
    });

  const changeRole = (userId: string, role: Role, label: string) =>
    run(`role-${userId}`, async () => {
      if (role === 'owner') {
        const ok = await confirm({
          title: `Make ${label} the owner?`,
          message: "They'll manage members and the household. You'll become an editor.",
          confirmLabel: 'Hand over',
        });
        if (!ok) return;
      }
      await cloudApi.changeRole(ledger.id, userId, role);
      await Promise.all([hh.reloadMembers(), role === 'owner' ? hh.refresh() : Promise.resolve()]);
    });

  const remove = async (userId: string, label: string) => {
    const self = userId === me.userId;
    const ok = await confirm({
      title: self ? `Leave ${ledger.name}?` : `Remove ${label}?`,
      message: self
        ? "You'll lose access to its expenses, budgets and history. The owner can invite you again."
        : "They'll lose access straight away. Entries they added stay in the household.",
      confirmLabel: self ? 'Leave household' : 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    await run(`rm-${userId}`, async () => {
      await cloudApi.removeMember(ledger.id, userId);
      if (self) {
        await hh.refresh();
        onClose();
      } else {
        await hh.reloadMembers();
      }
    }, self ? `You left ${ledger.name}` : `${label} removed`);
  };

  const rename = () =>
    run('rename', async () => {
      await cloudApi.renameLedger(ledger.id, name.trim());
      await hh.refresh();
      setRenaming(false);
    }, 'Household renamed');

  const createHousehold = () =>
    run('create', async () => {
      const created = await cloudApi.createLedger(newName.trim());
      await hh.refresh();
      setNewName('');
      setShowNew(false);
      hh.switchLedger(created.id);
      onClose();
    }, 'Household created');

  const deleteHousehold = async () => {
    const ok = await confirm({
      title: `Delete ${ledger.name}?`,
      message: 'Every expense, budget, recurring rule and member in it is deleted for everyone. This can’t be undone.',
      confirmLabel: 'Delete household',
      tone: 'danger',
    });
    if (!ok) return;
    await run('delete', async () => {
      await cloudApi.deleteLedger(ledger.id);
      const other = ledgers.find((l) => l.id !== ledger.id);
      await hh.refresh();
      if (other) hh.switchLedger(other.id);
      onClose();
    }, 'Household deleted');
  };

  return (
    <Modal
      title={renaming ? 'Rename household' : ledger.name}
      eyebrow="Household"
      subtitle={
        <>
          {members.length} {members.length === 1 ? 'member' : 'members'} · you{ledger.role === 'owner' ? "'re" : ' can'}{' '}
          <span className="text-ink font-medium">{ledger.role === 'owner' ? 'the owner' : ROLE_LABEL[ledger.role].toLowerCase()}</span>
        </>
      }
      headerAction={
        isOwner && !renaming ? (
          <button type="button" className={btnGhost} onClick={() => setRenaming(true)}>
            Rename
          </button>
        ) : undefined
      }
      onClose={onClose}
    >
      {renaming && (
        <div className="flex gap-2 mb-5">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Household name" autoFocus />
          <button type="button" className={btnPrimary} disabled={!name.trim() || busy === 'rename'} onClick={rename}>
            {busy === 'rename' ? <Spinner size="sm" tone="paper" /> : 'Save'}
          </button>
          <button type="button" className={btnSecondary} onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </div>
      )}

      <Section title="Members">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {members.map((m) => {
            const label = memberLabel(m);
            const self = m.userId === me.userId;
            return (
              <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
                <Initials name={label} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {label} {self && <span className="text-slate font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-slate truncate">
                    {m.email || '—'}
                    {m.joinedAt && <> · joined {format(new Date(m.joinedAt), 'MMM yyyy')}</>}
                  </p>
                </div>
                {isOwner && !self ? (
                  <select
                    className="text-xs rounded-md border border-line bg-surface px-2 py-1.5 text-ink"
                    value={m.role}
                    disabled={busy === `role-${m.userId}`}
                    onChange={(e) => changeRole(m.userId, e.target.value as Role, label)}
                    aria-label={`Role for ${label}`}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">View only</option>
                    <option value="owner">Make owner…</option>
                  </select>
                ) : (
                  <span
                    className={`text-[11px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 ${
                      m.role === 'owner' ? 'bg-brass/15 text-brass-strong dark:text-brass' : 'bg-paper text-slate'
                    }`}
                    title={ROLE_HINT[m.role]}
                  >
                    {ROLE_LABEL[m.role]}
                  </span>
                )}
                {((isOwner && !self) || (self && !isOwner)) && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => remove(m.userId, label)}
                    disabled={busy === `rm-${m.userId}`}
                    aria-label={self ? 'Leave household' : `Remove ${label}`}
                  >
                    {self ? 'Leave' : 'Remove'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {isOwner && (
        <Section title="Invite someone">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) invite();
            }}
          >
            <input
              id="invite-email"
              type="email"
              className={inputCls}
              placeholder="their email, e.g. raj@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email to invite"
            />
            <select
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              aria-label="Role"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
            <button type="submit" className={btnPrimary} disabled={!email.includes('@') || busy === 'invite'}>
              {busy === 'invite' ? <Spinner size="sm" tone="paper" /> : 'Invite'}
            </button>
          </form>
          <p className="text-xs text-slate mt-2">
            They'll see the invite the next time they sign in to ExpenseTrack Pro with this email (Google or Facebook
            with the same address works too). Invites last 14 days.
          </p>
          {invites && invites.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {invites.map((i) => (
                <li key={i.email} className="flex items-center gap-2 text-sm rounded-lg bg-paper px-3 py-2">
                  <span className="flex-1 min-w-0 truncate text-ink">{i.email}</span>
                  <span className="text-xs text-slate whitespace-nowrap">
                    {ROLE_LABEL[i.role]} · until {format(new Date(i.expiresAt), 'd MMM')}
                  </span>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() =>
                      run(`revoke-${i.email}`, async () => {
                        await cloudApi.revokeInvite(ledger.id, i.email);
                        setInvites((cur) => (cur ?? []).filter((x) => x.email !== i.email));
                      })
                    }
                  >
                    Withdraw
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Year">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm text-ink mb-2">Budgets, reports and the dashboard's “Year” follow:</p>
          <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Year starts in">
            {(
              [
                ['jan', 'Calendar year', 'January – December'],
                ['apr', 'Financial year', 'April – March (Indian FY)'],
              ] as const
            ).map(([value, title, hint]) => {
              const active = (settings.yearStart ?? 'jan') === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!canEdit || busy === 'year'}
                  onClick={() => run('year', () => onUpdateSettings({ yearStart: value }), `Year now runs ${hint.split(' (')[0]}`)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active ? 'border-pine bg-pine/8' : 'border-line hover:border-pine/50'
                  } disabled:opacity-60`}
                >
                  <span className="block text-sm font-medium text-ink">{title}</span>
                  <span className="block text-xs text-slate">{hint}</span>
                </button>
              );
            })}
          </div>
          {!canEdit && <p className="text-xs text-slate mt-2">Only editors and the owner can change this.</p>}
        </div>
      </Section>

      <Section
        title={ledgers.length > 1 ? 'Your households' : 'More households'}
        action={
          !showNew ? (
            <button type="button" className={btnGhost} onClick={() => setShowNew(true)}>
              + New household
            </button>
          ) : undefined
        }
      >
        {ledgers.length > 1 && (
          <ul className="space-y-1.5 mb-3">
            {ledgers.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  disabled={l.id === ledger.id}
                  onClick={() => {
                    hh.switchLedger(l.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    l.id === ledger.id ? 'border-pine bg-pine/8' : 'border-line hover:border-pine/50'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{l.name}</span>
                    <span className="block text-xs text-slate">
                      {ROLE_LABEL[l.role]} · {l.memberCount} {l.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </span>
                  <span className="text-xs text-pine-strong dark:text-pine">{l.id === ledger.id ? 'Open' : 'Switch'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {showNew ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createHousehold();
            }}
          >
            <input
              id="new-household-name"
              className={inputCls}
              placeholder="e.g. Parents' house, Goa trip 2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
              autoFocus
              aria-label="New household name"
            />
            <button type="submit" className={btnPrimary} disabled={!newName.trim() || busy === 'create'}>
              {busy === 'create' ? <Spinner size="sm" tone="paper" /> : 'Create'}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setShowNew(false)}>
              Cancel
            </button>
          </form>
        ) : (
          ledgers.length === 1 && (
            <p className="text-sm text-slate">
              Keep a separate book for your parents' home, a trip with friends or a side business — each with its own
              members.
            </p>
          )
        )}
      </Section>

      {isOwner && ledgers.length > 1 && (
        <Section title="Delete">
          <button type="button" className={btnDanger} onClick={deleteHousehold} disabled={busy === 'delete'}>
            Delete {ledger.name}
          </button>
        </Section>
      )}
    </Modal>
  );
}
