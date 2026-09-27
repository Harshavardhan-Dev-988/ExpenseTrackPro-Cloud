import type { Expense, CategoryType, PaymentMethod } from '../types';
import { CATEGORY_LABELS } from './constants';

export interface ValidationError {
  field: string;
  message: string;
}

export const validateExpense = (expense: Partial<Expense>): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate amount
  if (expense.amount === undefined || expense.amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required' });
  } else if (expense.amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be greater than 0' });
  } else if (expense.amount > 999999999) {
    errors.push({ field: 'amount', message: 'Amount is too large' });
  }

  // Validate date
  if (!expense.date) {
    errors.push({ field: 'date', message: 'Date is required' });
  } else {
    const date = new Date(expense.date);
    if (isNaN(date.getTime())) {
      errors.push({ field: 'date', message: 'Invalid date format' });
    } else if (date > new Date()) {
      errors.push({ field: 'date', message: 'Date cannot be in the future' });
    }
  }

  // Validate category
  if (!expense.category) {
    errors.push({ field: 'category', message: 'Category is required' });
  } else if (!Object.keys(CATEGORY_LABELS).includes(expense.category)) {
    errors.push({ field: 'category', message: 'Invalid category' });
  }

  // Validate description
  if (!expense.description || expense.description.trim() === '') {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (expense.description.length > 500) {
    errors.push({ field: 'description', message: 'Description is too long (max 500 characters)' });
  }

  // Validate payment method (optional)
  if (expense.paymentMethod) {
    const validMethods: PaymentMethod[] = ['cash', 'card', 'upi', 'netbanking', 'cheque', 'other'];
    if (!validMethods.includes(expense.paymentMethod)) {
      errors.push({ field: 'paymentMethod', message: 'Invalid payment method' });
    }
  }

  return errors;
};

export const validateBulkExpenses = (expenses: Partial<Expense>[]): {
  valid: Expense[];
  invalid: { expense: Partial<Expense>; errors: ValidationError[]; index: number }[];
} => {
  const valid: Expense[] = [];
  const invalid: { expense: Partial<Expense>; errors: ValidationError[]; index: number }[] = [];

  expenses.forEach((expense, index) => {
    const errors = validateExpense(expense);
    if (errors.length === 0) {
      valid.push(expense as Expense);
    } else {
      invalid.push({ expense, errors, index });
    }
  });

  return { valid, invalid };
};

export const validateAmount = (value: string): boolean => {
  const amountRegex = /^\d+(\.\d{1,2})?$/;
  return amountRegex.test(value) && parseFloat(value) > 0;
};

export const validateDateString = (value: string, format: string): boolean => {
  const formatRegexMap: Record<string, RegExp> = {
    'DD/MM/YYYY': /^\d{2}\/\d{2}\/\d{4}$/,
    'MM/DD/YYYY': /^\d{2}\/\d{2}\/\d{4}$/,
    'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
  };

  const regex = formatRegexMap[format];
  if (!regex || !regex.test(value)) {
    return false;
  }

  // Additional date validity check
  const parts = format === 'YYYY-MM-DD' 
    ? value.split('-')
    : value.split('/');
  
  let year: number, month: number, day: number;
  
  if (format === 'DD/MM/YYYY') {
    [day, month, year] = parts.map(Number);
  } else if (format === 'MM/DD/YYYY') {
    [month, day, year] = parts.map(Number);
  } else {
    [year, month, day] = parts.map(Number);
  }

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && 
         date.getMonth() === month - 1 && 
         date.getDate() === day;
};

export const sanitizeExpenseData = (data: any): Partial<Expense> => {
  return {
    id: data.id || undefined,
    date: data.date ? new Date(data.date) : undefined,
    amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount),
    category: data.category as CategoryType,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    paymentMethod: data.paymentMethod as PaymentMethod,
    tags: Array.isArray(data.tags) ? data.tags : [],
    receiptUrl: data.receiptUrl || undefined,
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: new Date(),
  };
};
