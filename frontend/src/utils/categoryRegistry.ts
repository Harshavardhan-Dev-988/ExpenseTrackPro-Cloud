/**
 * Built-in categories plus the user's own.
 *
 * The 81 built-in categories and 13 groups are static (utils/constants.ts).
 * A user can add sub-categories under any group and whole new parent groups;
 * those come from the API (/categories) and are merged into the same
 * `CATEGORY_GROUPS` array and `CATEGORY_LABELS` map that the rest of the app
 * already reads, so every picker, chart, export and filter picks them up
 * without each one learning about custom categories.
 *
 * `applyCustomCategories` mutates those two exports in place and is only
 * called from CategoriesProvider, which then bumps a version number so React
 * re-renders with the new names.
 */
import type { CategoryGroup, CategoryType, CustomCategoryData } from '../types';
import { CATEGORY_GROUPS, CATEGORY_GROUP_PALETTE, CATEGORY_LABELS } from './constants';

const BUILTIN_GROUPS: CategoryGroup[] = CATEGORY_GROUPS.map((g) => ({ ...g, categories: [...g.categories] }));
const BUILTIN_LABEL_KEYS = new Set(Object.keys(CATEGORY_LABELS));
const labels = CATEGORY_LABELS as Record<string, string>;

/** Where a custom category whose group has gone missing ends up. */
export const FALLBACK_GROUP_ID = 'financial_other';

/** Colours offered when creating a group — the ledger palette, then a few extras. */
export const GROUP_COLOR_CHOICES = [
  ...CATEGORY_GROUP_PALETTE,
  '#A35C7A',
  '#6E8B3D',
  '#2E6F95',
];

export const GROUP_ICON_CHOICES = ['🏷️', '🧾', '🪔', '👶', '🎓', '🐄', '🏗️', '💼', '🧘', '🎉', '🛕', '🚜', '📦', '🧹', '💡', '🎮'];

let current: CustomCategoryData = { groups: [], categories: [] };

export function applyCustomCategories(data: CustomCategoryData): void {
  current = data;

  for (const key of Object.keys(labels)) {
    if (!BUILTIN_LABEL_KEYS.has(key)) delete labels[key];
  }
  for (const c of data.categories) labels[c.id] = c.label;

  const groups: CategoryGroup[] = BUILTIN_GROUPS.map((g) => ({ ...g, categories: [...g.categories] }));
  for (const g of data.groups) {
    groups.push({ id: g.id, name: g.name, icon: g.icon, color: g.color, categories: [], custom: true });
  }
  for (const c of data.categories) {
    const target = groups.find((g) => g.id === c.groupId) ?? groups.find((g) => g.id === FALLBACK_GROUP_ID)!;
    target.categories.push(c.id as CategoryType);
  }
  CATEGORY_GROUPS.splice(0, CATEGORY_GROUPS.length, ...groups);
}

export const getCustomCategoryData = (): CustomCategoryData => current;

export const isCustomCategory = (id: string): boolean => id.startsWith('custom_');

/** Display name for any category id; unknown ids are prettified rather than shown raw. */
export function categoryLabel(id: string): string {
  return labels[id] ?? id.replace(/^custom_/, '').replace(/_[a-z0-9]{4}$/, '').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export const getGroupById = (id: string): CategoryGroup | undefined => CATEGORY_GROUPS.find((g) => g.id === id);

export const groupOfCategory = (category: string): CategoryGroup | undefined =>
  CATEGORY_GROUPS.find((g) => (g.categories as string[]).includes(category));

/** Colour a group is drawn in: built-ins by position in the ledger palette, custom groups by their own pick. */
export function groupColor(group: CategoryGroup): string {
  if (group.custom) return group.color;
  const index = BUILTIN_GROUPS.findIndex((g) => g.id === group.id);
  return CATEGORY_GROUP_PALETTE[(index < 0 ? 0 : index) % CATEGORY_GROUP_PALETTE.length];
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'item'
  );
}

const suffix = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');

export const newCustomCategoryId = (label: string): string => `custom_${slug(label)}_${suffix()}`;
export const newCustomGroupId = (name: string): string => `cg_${slug(name)}_${suffix()}`;

/** Budget key for a whole parent group. */
export const groupBudgetKey = (groupId: string) => `group:${groupId}` as const;
export const isGroupBudgetKey = (key: string): boolean => key.startsWith('group:');
export const groupIdFromBudgetKey = (key: string): string => key.slice('group:'.length);

/** Label for a budget row, whether it's on a category or a whole group. */
export function budgetLabel(key: string): string {
  if (isGroupBudgetKey(key)) {
    const group = getGroupById(groupIdFromBudgetKey(key));
    return group ? `${group.name} (whole group)` : 'Deleted group';
  }
  return categoryLabel(key);
}

/** Categories a budget key covers: one category, or every category in the group. */
export function categoriesForBudgetKey(key: string): string[] {
  if (isGroupBudgetKey(key)) return (getGroupById(groupIdFromBudgetKey(key))?.categories as string[]) ?? [];
  return [key];
}

/** Spread one colour into n distinct shades — a little darker than the
 * colour through to well lighter — for a group's sub-categories. */
export function shades(hex: string, n: number): string[] {
  const m = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  if (rgb.some(Number.isNaN)) return Array(n).fill(hex);
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : -0.28 + (i / (n - 1)) * 0.86; // −0.28 … +0.58
    const mix = rgb.map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t));
    return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  });
}
