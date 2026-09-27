import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import cloudApi from '../../services/cloudApi';
import type { WhatsAppLinkCode } from '../../services/cloudApi';

interface WhatsAppLinkProps {
  onClose: () => void;
}

export default function WhatsAppLink({ onClose }: WhatsAppLinkProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>();
  const [linkCode, setLinkCode] = useState<WhatsAppLinkCode | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await cloudApi.getWhatsAppStatus();
        if (cancelled) return;
        setLinked(status.linked);
        setPhoneNumber(status.phoneNumber);
      } catch (err) {
        if (!cancelled) setError('Could not check WhatsApp status. Please try again.');
        console.error('WhatsApp status error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGetCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const code = await cloudApi.createWhatsAppLinkCode();
      setLinkCode(code);
    } catch (err) {
      setError('Could not generate a linking code. Please try again.');
      console.error('WhatsApp link-code error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setError(null);
    try {
      await cloudApi.unlinkWhatsApp();
      setLinked(false);
      setPhoneNumber(undefined);
      setLinkCode(null);
    } catch (err) {
      setError('Could not unlink this number. Please try again.');
      console.error('WhatsApp unlink error:', err);
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Link WhatsApp"
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">Link WhatsApp</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate mt-1">Log expenses by texting a number, the moment you spend</p>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-ember/10 border border-ember/30 rounded-lg p-4">
              <p className="text-ember-strong dark:text-ember text-sm">{error}</p>
            </div>
          )}

          {loading && !linkCode && (
            <p className="text-sm text-slate">Checking status…</p>
          )}

          {!loading && linked && (
            <div className="space-y-4">
              <div className="bg-pine/10 border border-pine/30 rounded-lg p-4">
                <p className="text-pine-strong dark:text-pine text-sm font-medium">
                  ✅ Linked to {phoneNumber}
                </p>
                <p className="text-xs text-slate mt-1">
                  Text an amount and what it was for, e.g. "150 auto", and it'll show up as an expense.
                </p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="w-full px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink hover:border-ember hover:text-ember transition-colors disabled:opacity-50"
              >
                {unlinking ? 'Unlinking…' : 'Unlink this number'}
              </button>
            </div>
          )}

          {!loading && !linked && !linkCode && (
            <div className="space-y-4">
              <p className="text-sm text-slate">
                ExpenseTrack Pro uses Twilio's WhatsApp sandbox for now, so there are two quick steps
                to connect your number.
              </p>
              <button
                onClick={handleGetCode}
                className="w-full px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-medium hover:bg-pine-strong transition-colors"
              >
                Get a linking code
              </button>
            </div>
          )}

          {!loading && !linked && linkCode && (
            <div className="space-y-4">
              <ol className="space-y-3 text-sm text-ink list-decimal list-inside">
                <li>
                  On WhatsApp, send <span className="font-mono">join &lt;your sandbox word&gt;</span> to{' '}
                  <span className="font-mono font-semibold">{linkCode.sandboxNumber}</span> — the
                  sandbox word is shown on your Twilio console's WhatsApp Sandbox page (skip this
                  step if you've already joined before).
                </li>
                <li>
                  Then send this code to the same number:
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-lg font-semibold tracking-wider bg-paper border border-line rounded-lg px-3 py-2">
                      LINK {linkCode.code}
                    </span>
                  </div>
                </li>
              </ol>
              <p className="text-xs text-slate">
                This code expires in {Math.round(linkCode.expiresInSeconds / 60)} minutes. Once
                you've sent it, this number is linked to your account — no need to reopen this
                dialog.
              </p>
              <button
                onClick={handleGetCode}
                className="text-xs text-pine hover:text-pine-strong transition-colors"
              >
                Generate a new code
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
