import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Expense, CategoryBudget, Settings, SavingsEntry, SavingsGoal } from '../types';
import { 
  DB_NAME, 
  DB_VERSION, 
  EXPENSES_STORE_NAME,
  BUDGETS_STORE_NAME,
  SETTINGS_STORE_NAME,
  SAVINGS_STORE_NAME,
  SAVINGS_GOALS_STORE_NAME
} from '../utils/constants';

interface ExpenseTrackerDB extends DBSchema {
  [EXPENSES_STORE_NAME]: {
    key: string;
    value: Expense;
    indexes: { 
      'by-date': Date; 
      'by-category': string; 
      'by-amount': number;
      'by-created': Date;
    };
  };
  [BUDGETS_STORE_NAME]: {
    key: string;
    value: CategoryBudget;
  };
  [SETTINGS_STORE_NAME]: {
    key: string;
    value: Settings;
  };
  [SAVINGS_STORE_NAME]: {
    key: string;
    value: SavingsEntry;
    indexes: {
      'by-date': Date;
      'by-category': string;
      'by-amount': number;
    };
  };
  [SAVINGS_GOALS_STORE_NAME]: {
    key: string;
    value: SavingsGoal;
  };
}

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<ExpenseTrackerDB>> | null = null;

  private async getDB(): Promise<IDBPDatabase<ExpenseTrackerDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<ExpenseTrackerDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          // Create expenses store
          if (!db.objectStoreNames.contains(EXPENSES_STORE_NAME)) {
            const expenseStore = db.createObjectStore(EXPENSES_STORE_NAME, { 
              keyPath: 'id' 
            });
            expenseStore.createIndex('by-date', 'date');
            expenseStore.createIndex('by-category', 'category');
            expenseStore.createIndex('by-amount', 'amount');
            expenseStore.createIndex('by-created', 'createdAt');
          }

          // Create budgets store
          if (!db.objectStoreNames.contains(BUDGETS_STORE_NAME)) {
            db.createObjectStore(BUDGETS_STORE_NAME, { keyPath: 'category' });
          }

          // Create settings store
          if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
            db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
          }

          // Create savings store (version 2+)
          if (oldVersion < 2 && !db.objectStoreNames.contains(SAVINGS_STORE_NAME)) {
            const savingsStore = db.createObjectStore(SAVINGS_STORE_NAME, {
              keyPath: 'id'
            });
            savingsStore.createIndex('by-date', 'date');
            savingsStore.createIndex('by-category', 'category');
            savingsStore.createIndex('by-amount', 'amount');
          }

          // Create savings goals store (version 2+)
          if (oldVersion < 2 && !db.objectStoreNames.contains(SAVINGS_GOALS_STORE_NAME)) {
            db.createObjectStore(SAVINGS_GOALS_STORE_NAME, {
              keyPath: 'id'
            });
          }
        },
      });
    }
    return this.dbPromise;
  }

  // ===== EXPENSE OPERATIONS =====

  async addExpense(expense: Expense): Promise<string> {
    const db = await this.getDB();
    await db.add(EXPENSES_STORE_NAME, expense);
    return expense.id;
  }

  async addExpenses(expenses: Expense[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(EXPENSES_STORE_NAME, 'readwrite');
    await Promise.all([
      ...expenses.map(expense => tx.store.add(expense)),
      tx.done
    ]);
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const db = await this.getDB();
    return db.get(EXPENSES_STORE_NAME, id);
  }

  async getAllExpenses(): Promise<Expense[]> {
    const db = await this.getDB();
    return db.getAll(EXPENSES_STORE_NAME);
  }

  async getExpensesByDateRange(startDate: Date, endDate: Date): Promise<Expense[]> {
    const db = await this.getDB();
    const tx = db.transaction(EXPENSES_STORE_NAME, 'readonly');
    const index = tx.store.index('by-date');
    
    const range = IDBKeyRange.bound(startDate, endDate);
    return index.getAll(range);
  }

  async getExpensesByCategory(category: string): Promise<Expense[]> {
    const db = await this.getDB();
    const tx = db.transaction(EXPENSES_STORE_NAME, 'readonly');
    const index = tx.store.index('by-category');
    
    return index.getAll(category);
  }

  async updateExpense(expense: Expense): Promise<void> {
    const db = await this.getDB();
    await db.put(EXPENSES_STORE_NAME, expense);
  }

  async deleteExpense(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(EXPENSES_STORE_NAME, id);
  }

  async deleteExpenses(ids: string[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(EXPENSES_STORE_NAME, 'readwrite');
    await Promise.all([
      ...ids.map(id => tx.store.delete(id)),
      tx.done
    ]);
  }

  async clearAllExpenses(): Promise<void> {
    const db = await this.getDB();
    await db.clear(EXPENSES_STORE_NAME);
  }

  // ===== BUDGET OPERATIONS =====

  async addBudget(budget: CategoryBudget): Promise<void> {
    const db = await this.getDB();
    console.log('DB: Adding budget to IndexedDB:', budget);
    await db.put(BUDGETS_STORE_NAME, budget);
    console.log('DB: Budget added successfully');
  }

  async getBudget(category: string): Promise<CategoryBudget | undefined> {
    const db = await this.getDB();
    return db.get(BUDGETS_STORE_NAME, category);
  }

  async getAllBudgets(): Promise<CategoryBudget[]> {
    const db = await this.getDB();
    const budgets = await db.getAll(BUDGETS_STORE_NAME);
    console.log('DB: Retrieved all budgets:', budgets);
    return budgets;
  }

  async deleteBudget(category: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(BUDGETS_STORE_NAME, category);
  }

  async saveBudget(budget: CategoryBudget): Promise<void> {
    const db = await this.getDB();
    console.log('DB: Saving budget to IndexedDB:', budget);
    await db.put(BUDGETS_STORE_NAME, budget);
    console.log('DB: Budget saved successfully with category key:', budget.category);
    
    // Verify it was saved
    const saved = await db.get(BUDGETS_STORE_NAME, budget.category);
    console.log('DB: Verification - budget retrieved:', saved);
  }

  async clearAllBudgets(): Promise<void> {
    const db = await this.getDB();
    await db.clear(BUDGETS_STORE_NAME);
  }

  // ===== SETTINGS OPERATIONS =====

  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.getDB();
    await db.put(SETTINGS_STORE_NAME, { ...settings, id: 'app-settings' });
  }

  async getSettings(): Promise<Settings | undefined> {
    const db = await this.getDB();
    return db.get(SETTINGS_STORE_NAME, 'app-settings');
  }

  // ===== BACKUP/RESTORE OPERATIONS =====

  async exportAllData(): Promise<{
    expenses: Expense[];
    budgets: CategoryBudget[];
    settings?: Settings;
  }> {
    const [expenses, budgets, settings] = await Promise.all([
      this.getAllExpenses(),
      this.getAllBudgets(),
      this.getSettings(),
    ]);

    return { expenses, budgets, settings };
  }

  async importAllData(data: {
    expenses: Expense[];
    budgets: CategoryBudget[];
    settings?: Settings;
  }): Promise<void> {
    // Clear existing data
    await Promise.all([
      this.clearAllExpenses(),
      // Don't clear budgets and settings, just update them
    ]);

    // Import new data
    await Promise.all([
      this.addExpenses(data.expenses),
      ...data.budgets.map(budget => this.addBudget(budget)),
      data.settings ? this.saveSettings(data.settings) : Promise.resolve(),
    ]);
  }

  async getStorageSize(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  }

  // ===== SAVINGS OPERATIONS =====

  async addSavings(savings: SavingsEntry): Promise<string> {
    const db = await this.getDB();
    await db.add(SAVINGS_STORE_NAME, savings);
    return savings.id;
  }

  async getSavings(id: string): Promise<SavingsEntry | undefined> {
    const db = await this.getDB();
    return db.get(SAVINGS_STORE_NAME, id);
  }

  async getAllSavings(): Promise<SavingsEntry[]> {
    const db = await this.getDB();
    return db.getAll(SAVINGS_STORE_NAME);
  }

  async updateSavings(savings: SavingsEntry): Promise<void> {
    const db = await this.getDB();
    await db.put(SAVINGS_STORE_NAME, savings);
  }

  async deleteSavings(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(SAVINGS_STORE_NAME, id);
  }

  async clearAllSavings(): Promise<void> {
    const db = await this.getDB();
    await db.clear(SAVINGS_STORE_NAME);
  }

  // ===== SAVINGS GOALS OPERATIONS =====

  async addSavingsGoal(goal: SavingsGoal): Promise<string> {
    const db = await this.getDB();
    await db.add(SAVINGS_GOALS_STORE_NAME, goal);
    return goal.id;
  }

  async getSavingsGoal(id: string): Promise<SavingsGoal | undefined> {
    const db = await this.getDB();
    return db.get(SAVINGS_GOALS_STORE_NAME, id);
  }

  async getAllSavingsGoals(): Promise<SavingsGoal[]> {
    const db = await this.getDB();
    return db.getAll(SAVINGS_GOALS_STORE_NAME);
  }

  async updateSavingsGoal(goal: SavingsGoal): Promise<void> {
    const db = await this.getDB();
    await db.put(SAVINGS_GOALS_STORE_NAME, goal);
  }

  async deleteSavingsGoal(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(SAVINGS_GOALS_STORE_NAME, id);
  }

  async clearAllSavingsGoals(): Promise<void> {
    const db = await this.getDB();
    await db.clear(SAVINGS_GOALS_STORE_NAME);
  }
}

export const db = new DatabaseService();
export default db;
