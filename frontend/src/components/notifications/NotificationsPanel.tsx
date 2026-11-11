/** "Notifications" — your email preferences, and a preview of the emails
 * (budget alerts, monthly summary). Until the app has its own email domain,
 * emails are built but kept in an outbox instead of being sent. */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import type { EmailPreview } from '../../types';
import { useHousehold } from '../household/householdContext';
import Modal, { Section, btnSecondary } from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { errorMessage, useToast } from '../ui/toastContext';

function Toggle({ id, label, hint, checked, onChange, disabled }: {
  id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-slate">{hint}</span>
      </span>
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full bg-line peer-checked:bg-pine transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pine/50" />
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const hh = useHousehold();
  const toast = useToast();
  const prefs = hh.me.preferences;
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<EmailPreview[] | null>(null);

  useEffect(() => {
    if (!hh.canEdit) return;
    cloudApi.getOutbox().then(setOutbox).catch(() => setOutbox([]));
  }, [hh.canEdit]);

  const save = async (patch: Partial<typeof prefs>) => {
    setSaving(true);
    try {
      await hh.updatePreferences(patch);
    } catch (err) {
      toast.error("Couldn't save that", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const show = async (kind: 'monthly-summary' | 'budget-alert') => {
    setLoadingPreview(kind);
    try {
      setPreview(await cloudApi.previewEmail(kind));
    } catch (err) {
      toast.error("Couldn't build the preview", errorMessage(err));
    } finally {
      setLoadingPreview(null);
    }
  };

  return (
    <Modal title="Notifications" eyebrow="Email updates" onClose={onClose} width="max-w-xl"
      subtitle={hh.me.email ? <>Sent to <span className="text-ink">{hh.me.email}</span></> : 'Your account has no email address'}>
      {!hh.me.emailSendingEnabled && (
        <div className="mb-4 rounded-xl bg-brass/10 border border-brass/30 px-3.5 py-2.5 text-sm text-ink">
          Emails switch on once the app's own email domain is set up. Until then they're prepared but not sent — you can
          preview them below.
        </div>
      )}

      <Section title="Email me">
        <div className="divide-y divide-line rounded-xl border border-line bg-surface px-3.5">
          <Toggle id="pref-budget" label="Budget alerts" hint="When a budget crosses its alert threshold or goes over — once per budget per period."
            checked={prefs.notifyBudgetAlerts} disabled={saving} onChange={(v) => save({ notifyBudgetAlerts: v })} />
          <Toggle id="pref-summary" label="Monthly summary" hint="On the 1st: last month's total, how it compares, where it went and budget status."
            checked={prefs.notifyMonthlySummary} disabled={saving} onChange={(v) => save({ notifyMonthlySummary: v })} />
        </div>
        <p className="text-xs text-slate mt-2">These are your own settings; each household member chooses theirs.</p>
      </Section>

      <Section title="Preview">
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" className={btnSecondary} onClick={() => show('monthly-summary')} disabled={!!loadingPreview}>
            {loadingPreview === 'monthly-summary' ? <Spinner size="sm" /> : null} Last month's summary
          </button>
          <button type="button" className={btnSecondary} onClick={() => show('budget-alert')} disabled={!!loadingPreview}>
            {loadingPreview === 'budget-alert' ? <Spinner size="sm" /> : null} Budget alert
          </button>
        </div>
        {preview && (
          <div className="rounded-xl border border-line overflow-hidden bg-surface">
            <div className="px-3 py-2 border-b border-line text-sm">
              <span className="text-[10px] font-mono uppercase text-slate mr-2">Subject</span>
              <span className="text-ink">{preview.subject}</span>
            </div>
            {preview.html ? (
              <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="w-full h-[420px] bg-[#EEF1EE]" />
            ) : (
              <p className="px-3 py-4 text-sm text-slate">Nothing to send right now.</p>
            )}
          </div>
        )}
      </Section>

      {hh.canEdit && outbox && outbox.length > 0 && (
        <Section title="Prepared, not sent (last 30 days)">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {outbox.map((m, i) => (
              <li key={i}>
                <button type="button" className="w-full text-left px-3 py-2 hover:bg-paper" onClick={() => setPreview(m)}>
                  <span className="block text-sm text-ink truncate">{m.subject}</span>
                  <span className="block text-xs text-slate">
                    {m.createdAt ? format(new Date(m.createdAt), 'd MMM, h:mm a') : ''} · to {(m.to ?? []).join(', ') || '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Modal>
  );
}
