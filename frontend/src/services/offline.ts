/**
 * Working without a connection.
 *
 *  - Every successful read of your data (expenses, budgets, settings…) is
 *    kept in IndexedDB, per household. When the network is gone, reads are
 *    answered from that copy and the app shows an "offline" banner.
 *  - New expenses added while offline are queued here and sent, in order,
 *    as soon as the browser is back online (or the app next opens). Until
 *    then they show in the list with a temporary "offline-…" id.
 *  - Other changes (edits of synced entries, budgets, members…) need a
 *    connection and fail with a clear message.
 *
 * Status changes are broadcast as a window event, so any component can
 * show them (see components/ui/OfflineBanner.tsx).
 */
import { openDB, type IDBPDatabase } from 'idb';

export interface QueuedExpense {
  qid?: number;
  ledgerId: string | null;
  tempId: string;
  body: Record<string, unknown>;
  createdAt: string;
}

export interface OfflineStatus {
  offline: boolean;
  pending: number;
  syncing: boolean;
  /** When the copy being shown was last refreshed from the server. */
  dataFrom?: string;
}

const DB_NAME = 'etp-offline';
let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('responses');
        d.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
      },
    });
  }
  return dbp;
}

let status: OfflineStatus = { offline: typeof navigator !== 'undefined' && !navigator.onLine, pending: 0, syncing: false };

export const STATUS_EVENT = 'etp:offline-status';
export const SYNCED_EVENT = 'etp:synced';

function emit(patch: Partial<OfflineStatus>) {
  status = { ...status, ...patch };
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
}

export const getStatus = () => status;

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true; // fetch() itself failed
  const msg = err instanceof Error ? `${err.name} ${err.message}` : '';
  return /NetworkError|Failed to fetch|Load failed|Network request failed/i.test(msg);
}

// ---- read cache ----------------------------------------------------------------

const CACHEABLE = [/^\/me$/, /^\/expenses$/, /^\/settings$/, /^\/budgets$/, /^\/categories$/, /^\/recurring$/,
  /^\/savings\/(entries|goals)$/, /^\/ledgers\/[^/]+\/members$/, /^\/splits\/balances$/];

export const isCacheable = (path: string) => CACHEABLE.some((re) => re.test(path));

export async function saveResponse(key: string, data: unknown): Promise<void> {
  try {
    await (await db()).put('responses', { data, savedAt: new Date().toISOString() }, key);
  } catch {
    /* storage refused (private mode etc.): offline reads just won't work */
  }
}

export async function cachedResponse<T>(key: string): Promise<T | undefined> {
  try {
    const hit = (await (await db()).get('responses', key)) as { data: T; savedAt: string } | undefined;
    if (hit) emit({ offline: true, dataFrom: hit.savedAt });
    return hit?.data;
  } catch {
    return undefined;
  }
}

export function markOnline() {
  if (status.offline) emit({ offline: false });
}

// ---- write queue -----------------------------------------------------------------

export async function enqueue(item: QueuedExpense): Promise<void> {
  const d = await db();
  await d.add('queue', item);
  emit({ pending: await d.count('queue'), offline: true });
}

export async function queued(ledgerId?: string | null): Promise<QueuedExpense[]> {
  try {
    const all = (await (await db()).getAll('queue')) as QueuedExpense[];
    return ledgerId === undefined ? all : all.filter((q) => q.ledgerId === ledgerId);
  } catch {
    return [];
  }
}

export async function updateQueued(tempId: string, body: Record<string, unknown> | null): Promise<boolean> {
  const d = await db();
  const item = ((await d.getAll('queue')) as QueuedExpense[]).find((q) => q.tempId === tempId);
  if (!item) return false;
  if (body) await d.put('queue', { ...item, body });
  else await d.delete('queue', item.qid!);
  emit({ pending: await d.count('queue') });
  return true;
}

let syncing: Promise<number> | null = null;

/**
 * Send queued expenses. `send` posts one (with its household's header);
 * a rejected item with a 4xx status is dropped (it would never succeed),
 * a network error stops the run to retry later.
 */
export function syncQueue(send: (item: QueuedExpense) => Promise<void>): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    const d = await db().catch(() => null);
    if (!d) return 0;
    const items = (await d.getAll('queue')) as QueuedExpense[];
    if (!items.length) {
      emit({ pending: 0 });
      return 0;
    }
    emit({ syncing: true });
    let sent = 0;
    try {
      for (const item of items) {
        try {
          await send(item);
          sent++;
          await d.delete('queue', item.qid!);
        } catch (err) {
          if (isNetworkError(err)) break;
          const code = (err as { status?: number }).status ?? 0;
          if (code >= 400 && code < 500) await d.delete('queue', item.qid!);
          else break;
        }
      }
    } finally {
      emit({ syncing: false, pending: await d.count('queue') });
      if (sent) window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { sent } }));
    }
    return sent;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export async function refreshPendingCount(): Promise<void> {
  try {
    emit({ pending: await (await db()).count('queue') });
  } catch {
    /* ignore */
  }
}
