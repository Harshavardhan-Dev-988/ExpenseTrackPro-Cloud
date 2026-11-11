/** "You're offline" — shown while the app is answering from its saved copy,
 * with how many new expenses are waiting to be sent. Also triggers the send
 * when the connection comes back. */
import { useEffect, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import cloudApi from '../../services/cloudApi';
import { STATUS_EVENT, getStatus, refreshPendingCount, type OfflineStatus } from '../../services/offline';

export default function OfflineBanner() {
  const [st, setSt] = useState<OfflineStatus>(getStatus());

  useEffect(() => {
    const onStatus = (e: Event) => setSt((e as CustomEvent<OfflineStatus>).detail);
    const onOnline = () => {
      cloudApi.syncOffline().catch(() => undefined);
    };
    const onOffline = () => setSt((s) => ({ ...s, offline: true }));
    window.addEventListener(STATUS_EVENT, onStatus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    refreshPendingCount();
    if (navigator.onLine) onOnline();
    return () => {
      window.removeEventListener(STATUS_EVENT, onStatus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!st.offline && !st.pending && !st.syncing) return null;

  const waiting = st.pending ? `${st.pending} new ${st.pending === 1 ? 'expense' : 'expenses'} will be sent when you're back online.` : '';
  return (
    <div
      className={`mb-4 rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-2.5 border ${
        st.offline ? 'bg-ink/[0.04] border-line text-ink' : 'bg-pine/8 border-pine/30 text-ink'
      }`}
      role="status"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${st.offline ? 'bg-ember' : 'bg-pine animate-pulse'}`} aria-hidden="true" />
      {st.syncing ? (
        <span>Back online — sending expenses you added offline…</span>
      ) : st.offline ? (
        <span>
          <b>You're offline.</b>{' '}
          {st.dataFrom ? `Showing your ledger as of ${formatDistanceToNowStrict(new Date(st.dataFrom))} ago. ` : ''}
          You can still add expenses. {waiting}
        </span>
      ) : (
        <span>{waiting}</span>
      )}
    </div>
  );
}
