/**
 * Cloud replacement for `services/db.ts` (IndexedDB) — same method surface
 * (only the methods that actually have callers elsewhere; db.ts also has a
 * handful of unused ones like `getExpense`/`getExpensesByDateRange` that
 * were never wired up to anything and aren't reproduced here), but backed
 * by the deployed API instead of the browser's local database.
 *
 * Every request carries the signed-in user's Cognito ID token (not the
 * access token — the HTTP API's authorizer checks `aud` against the app
 * client id, which only the ID token carries). `fetchAuthSession()` throws
 * if nobody's signed in, which surfaces as a rejected promise here — by the
 * time this is called the app should already be behind the sign-in gate.
 *
 * Every request also says which household (ledger) it acts on, in an
 * `X-Ledger-Id` header set by HouseholdProvider via setCurrentLedger().
 *
 * Bulk imports, restores and wipes use the batch endpoints (100 expenses
 * per create call, 500 ids per delete call).
 */
import { fetchAuthSession } from 'aws-amplify/auth';
import { omit } from '../utils/omit';
import {
  cachedResponse,
  enqueue,
  isCacheable,
  isNetworkError,
  markOnline,
  queued,
  saveResponse,
  syncQueue,
  updateQueued,
  type QueuedExpense,
} from './offline';
import type {
  Balances,
  EmailPreview,
  Invite,
  LedgerSummary,
  Me,
  Member,
  Preferences,
  RecurringInput,
  RecurringRule,
  RecurringRunResult,
  Role,
  Settlement,
  CategoryBudget,
  CustomCategory,
  CustomCategoryGroup,
  CustomCategoryData,
  Expense,
  SavingsEntry,
  SavingsGoal,
  Settings,
} from '../types';

export interface WhatsAppLinkCode {
  code: string;
  expiresInSeconds: number;
  sandboxNumber: string;
}

export interface WhatsAppStatus {
  linked: boolean;
  phoneNumber?: string;
}

const API_BASE_URL = 'https://hbsqcepav7.execute-api.ap-southeast-2.amazonaws.com';

let currentLedgerId: string | null = null;

/** The household every following request acts on (null = the user's default). */
export function setCurrentLedger(id: string | null): void {
  currentLedgerId = id;
}

export const getCurrentLedger = () => currentLedgerId;

/** An API error with the HTTP status and the server's own explanation. */
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail || `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('Not signed in');
  }
  return { Authorization: `Bearer ${idToken}` };
}

/**
 * A request to the API. Reads of your data are cached for offline use and,
 * when the network is gone, answered from that cache (services/offline.ts).
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const cacheKey = method === 'GET' && isCacheable(path) ? `${currentLedgerId ?? 'default'}|${path}` : null;

  if (cacheKey && typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await cachedResponse<T>(cacheKey);
    if (cached !== undefined) return cached;
  }
  try {
    const data = await send<T>(path, options);
    if (cacheKey) {
      markOnline();
      void saveResponse(cacheKey, data);
    }
    return data;
  } catch (err) {
    if (cacheKey && isNetworkError(err)) {
      const cached = await cachedResponse<T>(cacheKey);
      if (cached !== undefined) return cached;
    }
    if (isNetworkError(err) && method !== 'GET') {
      throw new Error("You're offline — this change needs a connection. New expenses can still be added.", { cause: err });
    }
    throw err;
  }
}

async function send<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(currentLedgerId ? { 'X-Ledger-Id': currentLedgerId } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.detail === 'string') detail = parsed.detail;
      else if (Array.isArray(parsed?.detail)) detail = parsed.detail.map((d: { msg?: string }) => d.msg).join('; ');
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status, detail || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Runs `items` through `fn` with at most `limit` in flight at once.
 * `onProgress`, if given, is called after each item completes — used to
 * show "120 of 500" on long imports, restores and wipes.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// API responses carry dates as ISO strings; the frontend's types want real
// Date objects (JSON.stringify already turns a Date into an ISO string on
// the way out, so only the incoming direction needs converting).
function parseExpense(raw: Expense): Expense {
  return {
    ...raw,
    date: new Date(raw.date),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

function parseSavingsEntry(raw: SavingsEntry): SavingsEntry {
  return {
    ...raw,
    date: new Date(raw.date),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    maturityDate: raw.maturityDate ? new Date(raw.maturityDate) : undefined,
  };
}

function parseSavingsGoal(raw: SavingsGoal): SavingsGoal {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    deadline: raw.deadline ? new Date(raw.deadline) : undefined,
  };
}

class CloudApiService {
  // ===== EXPENSE OPERATIONS =====

  /** Create an expense; returns it as stored (server id, who recorded it).
   * Offline, it's queued and returned with a temporary "offline-…" id. */
  async createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> & Partial<Expense>): Promise<Expense> {
    const body = JSON.stringify(expense);
    const queue = async (): Promise<Expense> => {
      const now = new Date();
      const tempId = `offline-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      await enqueue({ ledgerId: currentLedgerId, tempId, body: JSON.parse(body), createdAt: now.toISOString() });
      return { ...(expense as Expense), id: tempId, createdAt: now, updatedAt: now };
    };
    if (typeof navigator !== 'undefined' && !navigator.onLine) return queue();
    try {
      return parseExpense(await send<Expense>('/expenses', { method: 'POST', body }));
    } catch (err) {
      if (isNetworkError(err)) return queue();
      throw err;
    }
  }

  /** Send expenses added while offline. Returns how many were sent. */
  syncOffline(): Promise<number> {
    return syncQueue((item: QueuedExpense) =>
      send('/expenses', {
        method: 'POST',
        body: JSON.stringify(item.body),
        headers: item.ledgerId ? { 'X-Ledger-Id': item.ledgerId } : {},
      }).then(() => undefined)
    );
  }

  async addExpense(expense: Expense): Promise<string> {
    return (await this.createExpense(expense)).id;
  }

  async addExpenses(expenses: Expense[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const chunks: Expense[][] = [];
    for (let i = 0; i < expenses.length; i += 100) chunks.push(expenses.slice(i, i + 100));
    let done = 0;
    await mapWithConcurrency(chunks, 3, async (chunk) => {
      await request('/expenses/batch', { method: 'POST', body: JSON.stringify({ items: chunk }) });
      done += chunk.length;
      onProgress?.(done, expenses.length);
    });
  }

  async getAllExpenses(): Promise<Expense[]> {
    const items = (await request<Expense[]>('/expenses')).map(parseExpense);
    // Expenses added offline and not yet sent show up too.
    const pending = await queued(currentLedgerId);
    return items.concat(
      pending.map((q) =>
        parseExpense({ ...(q.body as unknown as Expense), id: q.tempId, createdAt: q.createdAt as unknown as Date, updatedAt: q.createdAt as unknown as Date })
      )
    );
  }

  async updateExpense(expense: Expense): Promise<void> {
    if (expense.id.startsWith('offline-')) {
      const body = omit(expense, ['id', 'createdAt', 'updatedAt']);
      await updateQueued(expense.id, JSON.parse(JSON.stringify(body)));
      return;
    }
    await request(`/expenses/${expense.id}`, {
      method: 'PUT',
      // Plain JSON.stringify(expense) would silently DROP any key whose
      // value is `undefined` (e.g. receiptUrl after removing an attached
      // receipt) rather than sending it - and the backend's update route
      // treats an absent key as "leave it alone", so a cleared field would
      // never actually persist as cleared. The replacer turns every
      // undefined into an explicit null instead, which the backend does
      // treat as "clear this field" (see expenses.py's update_expense).
      body: JSON.stringify(expense, (_key, value) => (value === undefined ? null : value)),
    });
  }

  async deleteExpense(id: string): Promise<void> {
    if (id.startsWith('offline-')) {
      await updateQueued(id, null);
      return;
    }
    await request(`/expenses/${id}`, { method: 'DELETE' });
  }

  async deleteExpenses(ids: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await request('/expenses/batch-delete', { method: 'POST', body: JSON.stringify({ ids: chunk }) });
      done += chunk.length;
      onProgress?.(done, ids.length);
    }
    if (!ids.length) onProgress?.(0, 0);
  }

  async clearAllExpenses(onProgress?: (done: number, total: number) => void): Promise<void> {
    const existing = await this.getAllExpenses();
    await this.deleteExpenses(existing.map((expense) => expense.id), onProgress);
  }

  // ===== BUDGET OPERATIONS =====

  async addBudget(budget: CategoryBudget): Promise<void> {
    await this.saveBudget(budget);
  }

  async getAllBudgets(): Promise<CategoryBudget[]> {
    return request<CategoryBudget[]>('/budgets');
  }

  async deleteBudget(category: string): Promise<void> {
    await request(`/budgets/${encodeURIComponent(category)}`, { method: 'DELETE' });
  }

  async saveBudget(budget: CategoryBudget): Promise<void> {
    await request(`/budgets/${encodeURIComponent(budget.category)}`, {
      method: 'PUT',
      body: JSON.stringify(budget),
    });
  }

  async clearAllBudgets(): Promise<void> {
    const existing = await this.getAllBudgets();
    await mapWithConcurrency(existing, 5, (budget) => this.deleteBudget(budget.category));
  }

  // ===== CUSTOM CATEGORIES =====

  async getCustomCategories(): Promise<CustomCategoryData> {
    const data = await request<Partial<CustomCategoryData>>('/categories');
    return { groups: data.groups ?? [], categories: data.categories ?? [] };
  }

  async saveCustomGroup(group: CustomCategoryGroup): Promise<void> {
    await request(`/categories/groups/${encodeURIComponent(group.id)}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    });
  }

  async deleteCustomGroup(id: string): Promise<void> {
    await request(`/categories/groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async saveCustomCategory(category: CustomCategory): Promise<void> {
    await request(`/categories/items/${encodeURIComponent(category.id)}`, {
      method: 'PUT',
      body: JSON.stringify(category),
    });
  }

  async deleteCustomCategory(id: string): Promise<void> {
    await request(`/categories/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ===== SETTINGS OPERATIONS =====

  async saveSettings(settings: Settings): Promise<void> {
    await request('/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  async getSettings(): Promise<Settings | undefined> {
    return request<Settings>('/settings');
  }

  // ===== SAVINGS OPERATIONS =====

  async addSavings(savings: SavingsEntry): Promise<string> {
    const created = await request<SavingsEntry>('/savings/entries', {
      method: 'POST',
      body: JSON.stringify(savings),
    });
    return created.id;
  }

  async getAllSavings(): Promise<SavingsEntry[]> {
    const items = await request<SavingsEntry[]>('/savings/entries');
    return items.map(parseSavingsEntry);
  }

  async deleteSavings(id: string): Promise<void> {
    await request(`/savings/entries/${id}`, { method: 'DELETE' });
  }

  async addSavingsGoal(goal: SavingsGoal): Promise<string> {
    const created = await request<SavingsGoal>('/savings/goals', {
      method: 'POST',
      body: JSON.stringify(goal),
    });
    return created.id;
  }

  async getAllSavingsGoals(): Promise<SavingsGoal[]> {
    const items = await request<SavingsGoal[]>('/savings/goals');
    return items.map(parseSavingsGoal);
  }

  async deleteSavingsGoal(id: string): Promise<void> {
    await request(`/savings/goals/${id}`, { method: 'DELETE' });
  }

  // ===== RECEIPT PHOTOS =====
  // The bucket is private - every read or write goes through a short-lived
  // presigned URL, generated on demand rather than stored. Uploading is two
  // steps: ask the API for a presigned PUT (this also picks the S3 key,
  // scoped to the signed-in user), then PUT the raw file bytes straight to
  // S3 - the file never passes through our own Lambda.

  async uploadReceiptFile(file: File): Promise<string> {
    const { uploadUrl, key } = await request<{ uploadUrl: string; key: string }>(
      '/receipts/upload-url',
      { method: 'POST', body: JSON.stringify({ contentType: file.type }) }
    );

    // A plain fetch, not the `request()` helper - this goes straight to S3,
    // which authenticates via the presigned URL's own signature, not our
    // app's bearer token (S3 would just ignore/reject an Authorization
    // header meant for our API).
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Receipt upload failed: ${response.status} ${response.statusText}`);
    }
    return key;
  }

  async getReceiptViewUrl(key: string): Promise<string> {
    const { viewUrl } = await request<{ viewUrl: string }>(
      `/receipts/view-url?key=${encodeURIComponent(key)}`
    );
    return viewUrl;
  }

  async deleteReceipt(key: string): Promise<void> {
    // `key` itself contains slashes (receipts/<userId>/<uuid>.jpg) - the
    // backend route matches the rest of the path as-is, so it goes in
    // unencoded here, not as a query param.
    await request(`/receipts/${key}`, { method: 'DELETE' });
  }

  // ===== WHATSAPP LINKING (phase 4) =====
  // A phone number is only ever linked by redeeming a code minted here from
  // a signed-in session - the actual redemption ("LINK <code>") happens
  // entirely over WhatsApp, handled by the backend's /whatsapp/webhook.

  // ===== HOUSEHOLDS =====

  getMe(): Promise<Me> {
    return request<Me>('/me');
  }

  updatePreferences(prefs: Partial<Preferences>): Promise<Preferences> {
    return request<Preferences>('/me/preferences', { method: 'PUT', body: JSON.stringify(prefs) });
  }

  createLedger(name: string): Promise<LedgerSummary> {
    return request<LedgerSummary>('/ledgers', { method: 'POST', body: JSON.stringify({ name }) });
  }

  renameLedger(id: string, name: string): Promise<LedgerSummary> {
    return request<LedgerSummary>(`/ledgers/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  async deleteLedger(id: string): Promise<void> {
    await request(`/ledgers/${id}`, { method: 'DELETE' });
  }

  listMembers(ledgerId: string): Promise<Member[]> {
    return request<Member[]>(`/ledgers/${ledgerId}/members`);
  }

  changeRole(ledgerId: string, userId: string, role: Role): Promise<Member> {
    return request<Member>(`/ledgers/${ledgerId}/members/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(ledgerId: string, userId: string): Promise<void> {
    await request(`/ledgers/${ledgerId}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }

  listInvites(ledgerId: string): Promise<Invite[]> {
    return request<Invite[]>(`/ledgers/${ledgerId}/invites`);
  }

  createInvite(ledgerId: string, email: string, role: Role): Promise<Invite> {
    return request<Invite>(`/ledgers/${ledgerId}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) });
  }

  async revokeInvite(ledgerId: string, email: string): Promise<void> {
    await request(`/ledgers/${ledgerId}/invites/${encodeURIComponent(email)}`, { method: 'DELETE' });
  }

  acceptInvite(ledgerId: string): Promise<LedgerSummary> {
    return request<LedgerSummary>(`/invites/${ledgerId}/accept`, { method: 'POST' });
  }

  async declineInvite(ledgerId: string): Promise<void> {
    await request(`/invites/${ledgerId}/decline`, { method: 'POST' });
  }

  // ===== RECURRING EXPENSES =====

  listRecurring(): Promise<RecurringRule[]> {
    return request<RecurringRule[]>('/recurring');
  }

  createRecurring(rule: RecurringInput): Promise<RecurringRule> {
    return request<RecurringRule>('/recurring', { method: 'POST', body: JSON.stringify(rule) });
  }

  updateRecurring(id: string, rule: Partial<RecurringInput>): Promise<RecurringRule> {
    return request<RecurringRule>(`/recurring/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rule, (_k, v) => (v === undefined ? null : v)),
    });
  }

  async deleteRecurring(id: string): Promise<void> {
    await request(`/recurring/${id}`, { method: 'DELETE' });
  }

  runRecurring(): Promise<RecurringRunResult> {
    return request<RecurringRunResult>('/recurring/run', { method: 'POST' });
  }

  async logRecurring(id: string, due: string): Promise<Expense> {
    return parseExpense(await request<Expense>(`/recurring/${id}/log`, { method: 'POST', body: JSON.stringify({ due }) }));
  }

  skipRecurring(id: string, due: string): Promise<RecurringRule> {
    return request<RecurringRule>(`/recurring/${id}/skip`, { method: 'POST', body: JSON.stringify({ due }) });
  }

  // ===== SPLITS =====

  getBalances(): Promise<Balances> {
    return request<Balances>('/splits/balances');
  }

  settle(fromPerson: string, toPerson: string, amount: number, note?: string): Promise<Settlement> {
    return request<Settlement>('/splits/settlements', {
      method: 'POST',
      body: JSON.stringify({ fromPerson, toPerson, amount, note, date: new Date().toISOString() }),
    });
  }

  async undoSettlement(id: string): Promise<void> {
    await request(`/splits/settlements/${id}`, { method: 'DELETE' });
  }

  // ===== NOTIFICATIONS =====

  getOutbox(): Promise<EmailPreview[]> {
    return request<EmailPreview[]>('/notifications/outbox');
  }

  previewEmail(kind: 'monthly-summary' | 'budget-alert'): Promise<EmailPreview> {
    return request<EmailPreview>(`/notifications/preview/${kind}`);
  }

  async createWhatsAppLinkCode(): Promise<WhatsAppLinkCode> {
    return request<WhatsAppLinkCode>('/whatsapp/link-code', { method: 'POST' });
  }

  async getWhatsAppStatus(): Promise<WhatsAppStatus> {
    return request<WhatsAppStatus>('/whatsapp/status');
  }

  async unlinkWhatsApp(): Promise<void> {
    await request('/whatsapp/link', { method: 'DELETE' });
  }
}

export const cloudApi = new CloudApiService();
export default cloudApi;
