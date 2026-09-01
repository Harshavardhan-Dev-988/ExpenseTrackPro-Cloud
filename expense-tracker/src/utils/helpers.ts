import type { Expense, CategoryType } from '../types';
import { format, parse, isValid } from 'date-fns';
import { CATEGORY_GROUPS } from './constants';

/** Which of the CATEGORY_GROUPS a category belongs to — used to give
 * every category a consistent icon and group color across the redesigned UI. */
export const getCategoryGroup = (category: CategoryType) =>
  CATEGORY_GROUPS.find((group) => group.categories.includes(category));

export const getCategoryIcon = (category: CategoryType): string =>
  getCategoryGroup(category)?.icon || '💰';

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Locale-aware money formatting used across the redesigned UI — picks a
// sensible locale for the currency and drops decimals on whole amounts so
// tables of numbers line up cleanly.
const CURRENCY_LOCALES: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

export const formatMoney = (
  amount: number,
  currency: string = 'INR',
  options?: { alwaysShowDecimals?: boolean }
): string => {
  const locale = CURRENCY_LOCALES[currency] || 'en-IN';
  const hasFraction = Math.abs(amount % 1) > 0.001;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.alwaysShowDecimals ? 2 : hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCurrency = (
  amount: number, 
  currency: string = 'USD'
): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const formatDate = (
  date: Date, 
  dateFormat: string = 'MM/DD/YYYY'
): string => {
  const formatMap: Record<string, string> = {
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd',
  };
  
  return format(date, formatMap[dateFormat] || 'MM/dd/yyyy');
};

export const parseDate = (
  dateString: string, 
  dateFormat: string = 'MM/DD/YYYY'
): Date | null => {
  const formatMap: Record<string, string> = {
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd',
  };
  
  try {
    const parsed = parse(dateString, formatMap[dateFormat] || 'MM/dd/yyyy', new Date());
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const getCategoryColor = (category: CategoryType): string => {
  const colorMap: Record<string, string> = {
    grocery: '#FF6B6B',
    dine_out: '#FF6B6B',
    coffee_snacks: '#FF6B6B',
    fuel: '#4ECDC4',
    public_transport: '#4ECDC4',
    vehicle_maintenance: '#4ECDC4',
    bills_power: '#45B7D1',
    bills_wifi: '#45B7D1',
    bills_mobile: '#45B7D1',
    bills_water: '#45B7D1',
    rent_mortgage: '#45B7D1',
    shopping_clothes: '#FFA07A',
    shopping_electronics: '#FFA07A',
    entertainment: '#FFA07A',
    subscriptions: '#FFA07A',
    personal_care: '#FFA07A',
    fitness_gym: '#FFA07A',
    medical_consultation: '#98D8C8',
    medical_medicines: '#98D8C8',
    medical_tests: '#98D8C8',
    medical_hospitalization: '#98D8C8',
    medical_insurance: '#98D8C8',
    gifting_personal: '#F7DC6F',
    gifting_festivals: '#F7DC6F',
    donations_charity: '#F7DC6F',
    agri_seeds_fertilizers: '#82B74B',
    agri_equipment: '#82B74B',
    agri_irrigation: '#82B74B',
    agri_livestock: '#82B74B',
    agri_labor: '#82B74B',
    agri_land_lease: '#82B74B',
    agri_crop_insurance: '#82B74B',
    agri_loan_interest: '#82B74B',
    agri_storage_transport: '#82B74B',
    agri_other: '#82B74B',
    education: '#9B59B6',
    travel_vacation: '#3498DB',
    insurance_general: '#95A5A6',
    investments_savings: '#95A5A6',
    pets: '#95A5A6',
    household_maintenance: '#95A5A6',
    other: '#95A5A6',
  };
  
  return colorMap[category] || '#95A5A6';
};

export const downloadFile = (content: string, filename: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const groupExpensesByMonth = (expenses: Expense[]): Record<string, Expense[]> => {
  return expenses.reduce((acc, expense) => {
    const monthKey = format(new Date(expense.date), 'yyyy-MM');
    if (!acc[monthKey]) {
      acc[monthKey] = [];
    }
    acc[monthKey].push(expense);
    return acc;
  }, {} as Record<string, Expense[]>);
};

export const groupExpensesByCategory = (expenses: Expense[]): Record<CategoryType, Expense[]> => {
  return expenses.reduce((acc, expense) => {
    if (!acc[expense.category]) {
      acc[expense.category] = [];
    }
    acc[expense.category].push(expense);
    return acc;
  }, {} as Record<CategoryType, Expense[]>);
};

export const sortExpenses = (
  expenses: Expense[], 
  sortBy: 'date' | 'amount' | 'category' = 'date',
  order: 'asc' | 'desc' = 'desc'
): Expense[] => {
  const sorted = [...expenses].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'date':
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'amount':
        comparison = a.amount - b.amount;
        break;
      case 'category':
        comparison = a.category.localeCompare(b.category);
        break;
    }
    
    return order === 'asc' ? comparison : -comparison;
  });
  
  return sorted;
};
