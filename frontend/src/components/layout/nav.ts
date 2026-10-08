/** The app's top-level sections, in tab order. */
export type View = 'dashboard' | 'expenses' | 'budgets' | 'savings' | 'analytics';

export const NAV_ITEMS: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'savings', label: 'Savings' },
  { key: 'analytics', label: 'Reports' },
];
