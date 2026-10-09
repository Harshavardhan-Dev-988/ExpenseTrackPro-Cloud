import { useState, useEffect, useCallback } from 'react';
import type { Expense, FilterOptions } from '../types';
import db from '../services/cloudApi';
import { generateId } from '../utils/helpers';

/**
 * The expense list, loaded once from the API and then kept in sync locally.
 *
 * `loading` is only true for the very first load (the app shows its
 * full-screen "opening your ledger" state for that). Adds, edits and
 * deletes update the in-memory list directly once the API call succeeds,
 * instead of re-fetching the whole ledger — so deleting one row doesn't
 * blank the page behind a spinner. Mutation failures are thrown to the
 * caller (which shows a toast or an inline error); they never flip the
 * hook's `error`, which is reserved for "couldn't load the ledger at all".
 */
export const useExpenses = (filters?: FilterOptions) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyFilters = useCallback(
    (all: Expense[]) => {
      if (!filters) return all;
      let result = all;
      if (filters.dateRange) {
        result = result.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= filters.dateRange!.startDate && expenseDate <= filters.dateRange!.endDate;
        });
      }
      if (filters.categories && filters.categories.length > 0) {
        result = result.filter((expense) => filters.categories!.includes(expense.category));
      }
      if (filters.amountRange) {
        result = result.filter(
          (expense) => expense.amount >= filters.amountRange!.min && expense.amount <= filters.amountRange!.max
        );
      }
      if (filters.paymentMethods && filters.paymentMethods.length > 0) {
        result = result.filter(
          (expense) => expense.paymentMethod && filters.paymentMethods!.includes(expense.paymentMethod)
        );
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter((expense) => expense.description.toLowerCase().includes(query));
      }
      return result;
    },
    [filters]
  );

  const loadExpenses = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'initial') setLoading(true);
        else setRefreshing(true);
        setError(null);
        const allExpenses = await db.getAllExpenses();
        setExpenses(applyFilters(allExpenses));
      } catch (err) {
        console.error('Error loading expenses:', err);
        if (mode === 'refresh') throw err;
        setError(err instanceof Error ? err.message : 'Failed to load expenses');
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [applyFilters]
  );

  useEffect(() => {
    loadExpenses('initial');
  }, [loadExpenses]);

  const addExpense = useCallback(async (expenseData: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    const expense: Expense = {
      ...expenseData,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // The API assigns the real id (it ignores the one we send), so keep
    // the server's — otherwise editing/deleting this entry before the next
    // full reload would target an id the server has never heard of.
    const serverId = await db.addExpense(expense);
    const saved: Expense = { ...expense, id: serverId };
    setExpenses((prev) => [...prev, saved]);
    return serverId;
  }, []);

  const addExpenses = useCallback(
    async (expensesData: Expense[], onProgress?: (done: number, total: number) => void) => {
      await db.addExpenses(expensesData, onProgress);
      await loadExpenses('refresh');
    },
    [loadExpenses]
  );

  const updateExpense = useCallback(async (expense: Expense) => {
    const updatedExpense = { ...expense, updatedAt: new Date() };
    await db.updateExpense(updatedExpense);
    setExpenses((prev) => prev.map((e) => (e.id === updatedExpense.id ? updatedExpense : e)));
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    await db.deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const deleteExpenses = useCallback(async (ids: string[]) => {
    await db.deleteExpenses(ids);
    const gone = new Set(ids);
    setExpenses((prev) => prev.filter((e) => !gone.has(e.id)));
  }, []);

  const refreshExpenses = useCallback(() => loadExpenses('refresh'), [loadExpenses]);

  return {
    expenses,
    loading,
    refreshing,
    error,
    addExpense,
    addExpenses,
    updateExpense,
    deleteExpense,
    deleteExpenses,
    refreshExpenses,
  };
};
