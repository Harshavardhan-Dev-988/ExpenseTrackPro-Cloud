/**
 * Loads the signed-in user's custom categories once, merges them into the
 * built-in category registry (utils/categoryRegistry.ts), and exposes
 * create / rename / delete. Children render only after the first load, so
 * no screen ever shows a raw "custom_…" id for a moment.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomCategory, CustomCategoryData, CustomCategoryGroup } from '../../types';
import { cloudApi } from '../../services/cloudApi';
import { applyCustomCategories } from '../../utils/categoryRegistry';
import Spinner from '../ui/Spinner';
import { CategoriesContext, type CategoriesApi } from './categoriesContext';

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CustomCategoryData>({ groups: [], categories: [] });
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const commit = useCallback((next: CustomCategoryData) => {
    applyCustomCategories(next);
    setData(next);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    cloudApi
      .getCustomCategories()
      .then((loadedData) => {
        if (!cancelled) commit(loadedData);
      })
      .catch((error) => {
        // Built-in categories still work; custom ones just won't show names
        // until the next successful load.
        console.error("Couldn't load custom categories:", error);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  const saveGroup = useCallback(
    async (group: CustomCategoryGroup) => {
      await cloudApi.saveCustomGroup(group);
      setData((prev) => {
        const groups = prev.groups.some((g) => g.id === group.id)
          ? prev.groups.map((g) => (g.id === group.id ? group : g))
          : [...prev.groups, group];
        const next = { ...prev, groups };
        applyCustomCategories(next);
        return next;
      });
      setVersion((v) => v + 1);
    },
    []
  );

  const deleteGroup = useCallback(async (id: string) => {
    await cloudApi.deleteCustomGroup(id);
    setData((prev) => {
      const next = { ...prev, groups: prev.groups.filter((g) => g.id !== id) };
      applyCustomCategories(next);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  const saveCategory = useCallback(async (category: CustomCategory) => {
    await cloudApi.saveCustomCategory(category);
    setData((prev) => {
      const categories = prev.categories.some((c) => c.id === category.id)
        ? prev.categories.map((c) => (c.id === category.id ? category : c))
        : [...prev.categories, category];
      const next = { ...prev, categories };
      applyCustomCategories(next);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await cloudApi.deleteCustomCategory(id);
    setData((prev) => {
      const next = { ...prev, categories: prev.categories.filter((c) => c.id !== id) };
      applyCustomCategories(next);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  const reload = useCallback(async () => {
    commit(await cloudApi.getCustomCategories());
  }, [commit]);

  const api = useMemo<CategoriesApi>(
    () => ({ version, data, saveGroup, deleteGroup, saveCategory, deleteCategory, reload }),
    [version, data, saveGroup, deleteGroup, saveCategory, deleteCategory, reload]
  );

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto" />
          <p className="mt-4 text-sm text-slate font-mono">opening your ledger…</p>
        </div>
      </div>
    );
  }

  return <CategoriesContext.Provider value={api}>{children}</CategoriesContext.Provider>;
}

export default CategoriesProvider;
