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
 * The backend has no bulk create/delete endpoints, so `addExpenses`,
 * `deleteExpenses`, `clearAllExpenses` and `clearAllBudgets` fan out to the
 * single-item endpoints with `mapWithConcurrency`, capped so a large import
 * or wipe doesn't fire hundreds of requests at once.
 */
import { fetchAuthSession } from 'aws-amplify/auth';
import type { CategoryBudget, Expense, SavingsEntry, SavingsGoal, Settings } from '../types';

const API_BASE_URL = 'https://hbsqcepav7.execute-api.ap-southeast-2.amazonaws.com';

async function authHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('Not signed in');
  }
  return { Authorization: `Bearer ${idToken}` };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API request failed: ${response.status} ${response.statusText} ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Runs `items` through `fn` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
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

  async addExpense(expense: Expense): Promise<string> {
    const created = await request<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
    return created.id;
  }

  async addExpenses(expenses: Expense[]): Promise<void> {
    await mapWithConcurrency(expenses, 5, (expense) => this.addExpense(expense));
  }

  async getAllExpenses(): Promise<Expense[]> {
    const items = await request<Expense[]>('/expenses');
    return items.map(parseExpense);
  }

  async updateExpense(expense: Expense): Promise<void> {
    await request(`/expenses/${expense.id}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
  }

  async deleteExpense(id: string): Promise<void> {
    await request(`/expenses/${id}`, { method: 'DELETE' });
  }

  async deleteExpenses(ids: string[]): Promise<void> {
    await mapWithConcurrency(ids, 5, (id) => this.deleteExpense(id));
  }

  async clearAllExpenses(): Promise<void> {
    const existing = await this.getAllExpenses();
    await this.deleteExpenses(existing.map((expense) => expense.id));
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
}

export const cloudApi = new CloudApiService();
export default cloudApi;
