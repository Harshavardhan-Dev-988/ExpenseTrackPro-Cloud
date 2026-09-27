import { useState, useEffect, useCallback } from 'react';
import type { Expense, FilterOptions } from '../types';
import db from '../services/db';
import { generateId } from '../utils/helpers';

export const useExpenses = (filters?: FilterOptions) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let allExpenses = await db.getAllExpenses();

      // Apply filters
      if (filters) {
        if (filters.dateRange) {
          allExpenses = allExpenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= filters.dateRange!.startDate && 
                   expenseDate <= filters.dateRange!.endDate;
          });
        }

        if (filters.categories && filters.categories.length > 0) {
          allExpenses = allExpenses.filter(expense => 
            filters.categories!.includes(expense.category)
          );
        }

        if (filters.amountRange) {
          allExpenses = allExpenses.filter(expense =>
            expense.amount >= filters.amountRange!.min &&
            expense.amount <= filters.amountRange!.max
          );
        }

        if (filters.paymentMethods && filters.paymentMethods.length > 0) {
          allExpenses = allExpenses.filter(expense =>
            expense.paymentMethod && filters.paymentMethods!.includes(expense.paymentMethod)
          );
        }

        if (filters.searchQuery) {
          const query = filters.searchQuery.toLowerCase();
          allExpenses = allExpenses.filter(expense =>
            expense.description.toLowerCase().includes(query)
          );
        }
      }

      setExpenses(allExpenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const addExpense = useCallback(async (expenseData: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const expense: Expense = {
        ...expenseData,
        id: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.addExpense(expense);
      await loadExpenses();
      return expense.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
      throw err;
    }
  }, [loadExpenses]);

  const addExpenses = useCallback(async (expensesData: Expense[]) => {
    try {
      await db.addExpenses(expensesData);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expenses');
      throw err;
    }
  }, [loadExpenses]);

  const updateExpense = useCallback(async (expense: Expense) => {
    try {
      const updatedExpense = {
        ...expense,
        updatedAt: new Date(),
      };
      await db.updateExpense(updatedExpense);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update expense');
      throw err;
    }
  }, [loadExpenses]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await db.deleteExpense(id);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense');
      throw err;
    }
  }, [loadExpenses]);

  const deleteExpenses = useCallback(async (ids: string[]) => {
    try {
      await db.deleteExpenses(ids);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expenses');
      throw err;
    }
  }, [loadExpenses]);

  return {
    expenses,
    loading,
    error,
    addExpense,
    addExpenses,
    updateExpense,
    deleteExpense,
    deleteExpenses,
    refreshExpenses: loadExpenses,
  };
};
