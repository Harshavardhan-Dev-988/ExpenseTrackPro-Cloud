import { useState, useEffect, useCallback } from 'react';
import type { CategoryBudget, CategoryType } from '../types';
import db from '../services/db';

export const useCategories = () => {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allBudgets = await db.getAllBudgets();
      setBudgets(allBudgets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budgets');
      console.error('Error loading budgets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  const setBudget = useCallback(async (budget: CategoryBudget) => {
    try {
      await db.addBudget(budget);
      await loadBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set budget');
      throw err;
    }
  }, [loadBudgets]);

  const getBudget = useCallback((category: CategoryType): CategoryBudget | undefined => {
    return budgets.find(b => b.category === category);
  }, [budgets]);

  const deleteBudget = useCallback(async (category: CategoryType) => {
    try {
      await db.deleteBudget(category);
      await loadBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete budget');
      throw err;
    }
  }, [loadBudgets]);

  return {
    budgets,
    loading,
    error,
    setBudget,
    getBudget,
    deleteBudget,
    refreshBudgets: loadBudgets,
  };
};
