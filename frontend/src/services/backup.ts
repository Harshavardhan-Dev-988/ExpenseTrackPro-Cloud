import { db } from './db';
import type { Expense, CategoryBudget, Settings, CategoryType } from '../types';
import { CATEGORY_LABELS } from '../utils/constants';

export interface BackupData {
  version: string;
  exportDate: string;
  data: {
    expenses: Expense[];
    budgets: CategoryBudget[];
    settings: Settings | null;
  };
  metadata: {
    expenseCount: number;
    budgetCount: number;
    dateRange: {
      earliest: string | null;
      latest: string | null;
    };
  };
}

/**
 * Export all data from IndexedDB as a backup file
 */
export async function exportBackup(): Promise<BackupData> {
  try {
    // Fetch all data from database
    const expenses = await db.getAllExpenses();
    const budgets = await db.getAllBudgets();
    const settings = await db.getSettings();

    // Calculate metadata
    const dates = expenses.map(e => new Date(e.date).getTime()).filter(d => !isNaN(d));
    const earliest = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
    const latest = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;

    const backup: BackupData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        expenses,
        budgets,
        settings,
      },
      metadata: {
        expenseCount: expenses.length,
        budgetCount: budgets.length,
        dateRange: {
          earliest,
          latest,
        },
      },
    };

    return backup;
  } catch (error) {
    console.error('Failed to export backup:', error);
    throw new Error('Failed to export backup data');
  }
}

/**
 * Download backup data as a JSON file
 */
export function downloadBackup(backup: BackupData): void {
  const dataStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `expense-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validate backup file structure
 */
export function validateBackup(data: any): { valid: boolean; error?: string } {
  try {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid backup file format' };
    }

    if (!data.version || !data.exportDate || !data.data) {
      return { valid: false, error: 'Missing required backup fields' };
    }

    if (!Array.isArray(data.data.expenses)) {
      return { valid: false, error: 'Invalid expenses data' };
    }

    if (!Array.isArray(data.data.budgets)) {
      return { valid: false, error: 'Invalid budgets data' };
    }

    // Validate expense structure
    for (const expense of data.data.expenses) {
      if (!expense.id || !expense.date || expense.amount == null || !expense.category) {
        return { valid: false, error: 'Invalid expense structure in backup' };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to parse backup file' };
  }
}

/**
 * Import backup data into IndexedDB
 * @param backup Validated backup data
 * @param mode 'merge' to keep existing data, 'replace' to clear and import
 */
export async function importBackup(
  backup: BackupData,
  mode: 'merge' | 'replace'
): Promise<{ success: boolean; imported: { expenses: number; budgets: number } }> {
  try {
    if (mode === 'replace') {
      // Clear existing data
      await db.clearAllExpenses();
      await db.clearAllBudgets();
    }

    // Create reverse mapping for category labels to keys (for legacy backups)
    const categoryLabelToKey: Record<string, CategoryType> = {};
    Object.entries(CATEGORY_LABELS).forEach(([key, label]) => {
      categoryLabelToKey[label] = key as CategoryType;
    });

    // Transform expenses to fix category values if needed
    const transformedExpenses = backup.data.expenses.map(expense => {
      const rawCategory = expense.category as string;
      // If category is a label, convert to key
      if (categoryLabelToKey[rawCategory]) {
        return { ...expense, category: categoryLabelToKey[rawCategory] };
      }
      return expense;
    });

    // Import expenses
    let importedExpenses = 0;
    if (transformedExpenses.length > 0) {
      await db.addExpenses(transformedExpenses);
      importedExpenses = transformedExpenses.length;
    }

    // Import budgets
    let importedBudgets = 0;
    for (const budget of backup.data.budgets) {
      await db.saveBudget(budget);
      importedBudgets++;
    }

    // Import settings
    if (backup.data.settings) {
      await db.saveSettings(backup.data.settings);
    }

    return {
      success: true,
      imported: {
        expenses: importedExpenses,
        budgets: importedBudgets,
      },
    };
  } catch (error) {
    console.error('Failed to import backup:', error);
    throw new Error('Failed to import backup data');
  }
}

/**
 * Parse backup file from uploaded file
 */
export async function parseBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        const validation = validateBackup(data);
        if (!validation.valid) {
          reject(new Error(validation.error));
          return;
        }

        resolve(data as BackupData);
      } catch (error) {
        reject(new Error('Failed to parse backup file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read backup file'));
    };

    reader.readAsText(file);
  });
}
