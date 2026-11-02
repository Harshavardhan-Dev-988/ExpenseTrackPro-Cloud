/**
 * Custom categories context + hook (provider lives in CategoriesProvider.tsx,
 * kept apart so fast refresh works on both).
 */
import { createContext, useContext } from 'react';
import type { CustomCategory, CustomCategoryData, CustomCategoryGroup } from '../../types';

export interface CategoriesApi {
  /** Bumps whenever custom categories change — use as a memo dependency. */
  version: number;
  data: CustomCategoryData;
  saveGroup: (group: CustomCategoryGroup) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  saveCategory: (category: CustomCategory) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  /** Re-read from the API (e.g. after a backup restore). */
  reload: () => Promise<void>;
}

export const CategoriesContext = createContext<CategoriesApi | null>(null);

export function useCategories(): CategoriesApi {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used inside <CategoriesProvider>');
  return ctx;
}
