/**
 * The signed-in user: the initials avatar (also used on the header's menu
 * button) and the account block shown at the top of that menu.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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

interface AccountSummaryProps {
  profile: UserProfile | null;
  stats: AccountStats;
  currency: string;
  /** Opens WhatsApp setup (the caller closes the menu first). */
  onWhatsApp: () => void;
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

/**
 * The account block at the top of the header menu (desktop dropdown and
 * phone drawer): who you are, a few facts about your ledger, and — one
 * click away — the account details.
 */
export default function AccountSummary({ profile, stats, currency, onWhatsApp }: AccountSummaryProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [wa, setWa] = useState<{ linked: boolean; phoneNumber?: string } | null | 'error'>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!showDetails || wa !== null) return;
    let cancelled = false;
    cloudApi
      .getWhatsAppStatus()
      .then((s) => !cancelled && setWa(s))
      .catch(() => !cancelled && setWa('error'));
    return () => {
      cancelled = true;
    };
  }, [showDetails, wa]);

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
    <div className="rounded-xl bg-paper/70 border border-line overflow-hidden">
      {/* Identity */}
      <div className="p-3.5 flex items-center gap-3">
        <Avatar profile={profile} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-ink leading-tight truncate">{profile?.displayName ?? '—'}</p>
          <p className="text-xs text-slate truncate">{profile?.email || 'No email on this account'}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile && <MethodBadge method={profile.method} />}
            {profile?.emailVerified && (
              <span className="inline-flex items-center gap-1 text-[11px] text-pine-strong dark:text-pine bg-pine/10 rounded-full px-2 py-0.5">
                ✓ Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ledger facts */}
      <div className="grid grid-cols-3 gap-px bg-line border-t border-line">
        <Fact label="Entries" value={stats.entries.toLocaleString('en-IN')} />
        <Fact label="This month" value={formatMoney(Math.round(stats.thisMonth), currency)} />
        <Fact label="Since" value={stats.firstEntry ? format(stats.firstEntry, 'MMM yyyy') : '—'} />
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-slate hover:text-ink border-t border-line transition-colors"
      >
        Account details
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.dl
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 space-y-1.5 text-xs">
              <Row label="Signed in">
                {profile?.signedInAt ? `${formatDistanceToNowStrict(profile.signedInAt)} ago` : '—'}
              </Row>
              {profile?.linkedAt && <Row label={`${METHOD_LABEL[profile.method]} linked`}>{format(profile.linkedAt, 'd MMM yyyy')}</Row>}
              <Row label="Categories used">
                {stats.categoriesUsed}
                {stats.customCategories ? ` · ${stats.customCategories} your own` : ''}
              </Row>
              <Row label="WhatsApp">
                {wa === null ? (
                  <span className="text-slate">checking…</span>
                ) : wa === 'error' ? (
                  <span className="text-slate">unavailable</span>
                ) : wa.linked ? (
                  <span className="text-pine-strong dark:text-pine">Linked · {wa.phoneNumber}</span>
                ) : (
                  <button type="button" onClick={onWhatsApp} className="text-pine-strong dark:text-pine underline underline-offset-2">
                    Not linked — set up
                  </button>
                )}
              </Row>
              <Row label="Data region">Sydney · ap-southeast-2</Row>
              <Row label="User ID">
                <button
                  type="button"
                  onClick={copyId}
                  className="font-mono text-[11px] text-slate hover:text-ink select-all"
                  title="Copy user ID (useful when asking for support)"
                >
                  {copied ? 'copied' : profile ? `${profile.userId.slice(0, 8)}…` : '—'}
                </button>
              </Row>
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <p className="text-[9.5px] uppercase tracking-wider text-slate font-mono">{label}</p>
      <p className="font-display text-sm font-semibold text-ink tabular leading-tight truncate">{value}</p>
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
