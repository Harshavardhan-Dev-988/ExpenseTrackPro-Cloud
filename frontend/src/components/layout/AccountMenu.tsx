/**
 * The signed-in user, top right: an initials avatar that opens an account
 * panel — who you are, how you signed in, a few facts about your ledger,
 * WhatsApp link status, and the account actions.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { format, formatDistanceToNowStrict } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { UserProfile } from '../../hooks/useUserProfile';
import { formatMoney } from '../../utils/helpers';

export interface AccountStats {
  entries: number;
  firstEntry?: Date;
  thisMonth: number;
  categoriesUsed: number;
  customCategories: number;
}

interface AccountMenuProps {
  profile: UserProfile | null;
  stats: AccountStats;
  currency: string;
  onManageCategories: () => void;
  onWhatsApp: () => void;
  onSignOut: () => void;
}

const METHOD_LABEL: Record<UserProfile['method'], string> = {
  email: 'Email & password',
  google: 'Google',
  facebook: 'Facebook',
  other: 'Single sign-on',
};

function MethodBadge({ method }: { method: UserProfile['method'] }) {
  const glyph =
    method === 'google' ? (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
        <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
      </svg>
    ) : method === 'facebook' ? (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
        <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink bg-paper border border-line rounded-full px-2 py-0.5">
      {glyph}
      {METHOD_LABEL[method]}
    </span>
  );
}

export function Avatar({ profile, size = 36 }: { profile: UserProfile | null; size?: number }) {
  return (
    <span
      className="rounded-full bg-gradient-to-br from-[#7AA891] to-[#2F4D3F] text-white font-display font-semibold flex items-center justify-center shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {profile?.initials ?? '·'}
    </span>
  );
}

export default function AccountMenu({ profile, stats, currency, onManageCategories, onWhatsApp, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [wa, setWa] = useState<{ linked: boolean; phoneNumber?: string } | null | 'error'>(null);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    cloudApi
      .getWhatsAppStatus()
      .then((s) => !cancelled && setWa(s))
      .catch(() => !cancelled && setWa('error'));
    const onPointer = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const copyId = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused — the id is still visible to select */
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={profile ? `Account: ${profile.displayName}` : 'Account'}
        className={`flex items-center gap-2 h-10 rounded-full pl-0.5 pr-0.5 xl:pr-3 border transition-colors ${
          open ? 'border-pine bg-surface' : 'border-transparent hover:border-line hover:bg-surface'
        }`}
      >
        <Avatar profile={profile} />
        <span className="hidden xl:block text-left leading-tight max-w-[10rem]">
          <span className="block text-sm font-medium text-ink truncate">{profile?.displayName ?? 'Account'}</span>
          <span className="block text-[11px] text-slate truncate">{profile?.email}</span>
        </span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label="Your account"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed z-[65] top-[68px] right-3 sm:right-6 w-[min(calc(100vw-24px),360px)] max-h-[calc(100vh-84px)] overflow-y-auto card-surface shadow-ledger-lg origin-top-right"
            >
              {/* Identity */}
              <div className="p-4 flex items-start gap-3 border-b border-line">
                <Avatar profile={profile} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold text-ink leading-tight truncate">{profile?.displayName ?? '—'}</p>
                  <p className="text-sm text-slate truncate">{profile?.email || 'No email on this account'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile && <MethodBadge method={profile.method} />}
                    {profile?.emailVerified && (
                      <span className="inline-flex items-center gap-1 text-xs text-pine-strong dark:text-pine bg-pine/10 rounded-full px-2 py-0.5">
                        ✓ Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ledger facts */}
              <div className="grid grid-cols-2 gap-px bg-line border-b border-line">
                <Fact label="Entries" value={stats.entries.toLocaleString('en-IN')} />
                <Fact label="This month" value={formatMoney(stats.thisMonth, currency)} />
                <Fact
                  label="Ledger since"
                  value={stats.firstEntry ? format(stats.firstEntry, 'MMM yyyy') : '—'}
                  hint={stats.firstEntry ? formatDistanceToNowStrict(stats.firstEntry) : undefined}
                />
                <Fact
                  label="Categories used"
                  value={String(stats.categoriesUsed)}
                  hint={stats.customCategories ? `${stats.customCategories} of your own` : undefined}
                />
              </div>

              {/* Details */}
              <dl className="px-4 py-3 space-y-2 text-sm border-b border-line">
                <Row label="Signed in">
                  {profile?.signedInAt ? `${formatDistanceToNowStrict(profile.signedInAt)} ago` : '—'}
                </Row>
                {profile?.linkedAt && <Row label={`${METHOD_LABEL[profile.method]} linked`}>{format(profile.linkedAt, 'd MMM yyyy')}</Row>}
                <Row label="WhatsApp">
                  {wa === null ? (
                    <span className="text-slate">checking…</span>
                  ) : wa === 'error' ? (
                    <span className="text-slate">unavailable</span>
                  ) : wa.linked ? (
                    <span className="text-pine-strong dark:text-pine">Linked · {wa.phoneNumber}</span>
                  ) : (
                    <button type="button" onClick={run(onWhatsApp)} className="text-pine-strong dark:text-pine underline underline-offset-2">
                      Not linked — set up
                    </button>
                  )}
                </Row>
                <Row label="Data region">Sydney · ap-southeast-2</Row>
                <Row label="User ID">
                  <button
                    type="button"
                    onClick={copyId}
                    className="font-mono text-xs text-slate hover:text-ink select-all"
                    title="Copy user ID (useful when asking for support)"
                  >
                    {copied ? 'copied' : profile ? `${profile.userId.slice(0, 8)}…` : '—'}
                  </button>
                </Row>
              </dl>

              {/* Actions */}
              <div className="p-1.5">
                <ActionButton onClick={run(onManageCategories)}>Manage categories</ActionButton>
                <ActionButton onClick={run(onWhatsApp)}>WhatsApp logging</ActionButton>
                <div className="my-1 border-t border-line" />
                <ActionButton tone="danger" onClick={run(onSignOut)}>Sign out</ActionButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate font-mono">{label}</p>
      <p className="font-display text-lg font-semibold text-ink tabular leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-slate">{hint}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="text-ink text-right min-w-0 truncate">{children}</dd>
    </div>
  );
}

function ActionButton({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        tone === 'danger' ? 'text-ember-strong dark:text-ember hover:bg-ember/8' : 'text-ink hover:bg-paper'
      }`}
    >
      {children}
    </button>
  );
}
