import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { Expense, CategoryBudget } from '../types';
import { CATEGORY_LABELS } from '../utils/constants';

export class ExportService {
  /**
   * Export expenses to CSV format
   */
  static exportToCSV(expenses: Expense[], filename: string = 'expenses.csv'): void {
    const data = expenses.map(expense => ({
      Date: format(new Date(expense.date), 'yyyy-MM-dd'),
      Amount: expense.amount.toFixed(2),
      Category: expense.category, // Export internal key for re-import compatibility
      Description: expense.description,
      'Payment Method': expense.paymentMethod || '',
      Tags: expense.tags?.join(', ') || '',
      'Created At': format(new Date(expense.createdAt), 'yyyy-MM-dd HH:mm:ss'),
    }));

    const csv = Papa.unparse(data);
    this.downloadFile(csv, filename, 'text/csv');
  }

  /**
   * Export expenses to Excel format with optional budgets sheet
   */
  static exportToExcel(expenses: Expense[], budgets: CategoryBudget[] = [], filename: string = 'expenses.xlsx'): void {
    // Expenses sheet
    const expenseData = expenses.map(expense => ({
      Date: format(new Date(expense.date), 'yyyy-MM-dd'),
      Amount: expense.amount,
      Category: expense.category, // Export internal key for re-import compatibility
      Description: expense.description,
      'Payment Method': expense.paymentMethod || '',
      Tags: expense.tags?.join(', ') || '',
      'Created At': format(new Date(expense.createdAt), 'yyyy-MM-dd HH:mm:ss'),
    }));

    const expenseWorksheet = XLSX.utils.json_to_sheet(expenseData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, expenseWorksheet, 'Expenses');

    // Budgets sheet (if budgets provided)
    if (budgets && budgets.length > 0) {
      const budgetData = budgets.map(budget => ({
        Category: budget.category,
        'Category Label': CATEGORY_LABELS[budget.category] || budget.category,
        'Monthly Limit': budget.monthlyLimit,
        'Alert Threshold (%)': budget.alertThreshold,
        'Is Active': budget.isActive ? 'Yes' : 'No',
      }));

      const budgetWorksheet = XLSX.utils.json_to_sheet(budgetData);
      XLSX.utils.book_append_sheet(workbook, budgetWorksheet, 'Budgets');
    }

    // Auto-size columns
    const maxWidth = 20;
    if (expenseData.length > 0) {
      const expenseColWidths = Object.keys(expenseData[0]).map(() => ({ wch: maxWidth }));
      expenseWorksheet['!cols'] = expenseColWidths;
    }

    XLSX.writeFile(workbook, filename);
  }

  /**
   * Export expenses to JSON format with optional budgets
   */
  static exportToJSON(expenses: Expense[], budgets: CategoryBudget[] = [], filename: string = 'expenses.json'): void {
    const data: any = {
      expenses: expenses.map(expense => ({
        id: expense.id,
        date: format(new Date(expense.date), 'yyyy-MM-dd'),
        amount: expense.amount,
        category: expense.category,
        categoryLabel: CATEGORY_LABELS[expense.category],
        description: expense.description,
        paymentMethod: expense.paymentMethod,
        tags: expense.tags,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      })),
    };

    // Include budgets if provided
    if (budgets && budgets.length > 0) {
      data.budgets = budgets.map(budget => ({
        category: budget.category,
        categoryLabel: CATEGORY_LABELS[budget.category] || budget.category,
        monthlyLimit: budget.monthlyLimit,
        alertThreshold: budget.alertThreshold,
        isActive: budget.isActive,
      }));
    }

    const json = JSON.stringify(data, null, 2);
    this.downloadFile(json, filename, 'application/json');
  }

  /**
   * Export budgets to CSV format
   */
  static exportBudgetsToCSV(budgets: CategoryBudget[], filename: string = 'budgets.csv'): void {
    const data = budgets.map(budget => ({
      Category: budget.category,
      'Category Label': CATEGORY_LABELS[budget.category] || budget.category,
      'Monthly Limit': budget.monthlyLimit,
      'Alert Threshold (%)': budget.alertThreshold,
      'Is Active': budget.isActive ? 'Yes' : 'No',
    }));

    const csv = Papa.unparse(data);
    this.downloadFile(csv, filename, 'text/csv');
  }

  /**
   * Helper method to trigger file download
   */
  private static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export summary statistics to CSV
   */
  static exportSummaryToCSV(
    summary: {
      totalExpenses: number;
      averageExpense: number;
      transactionCount: number;
      categoryStats: Array<{ category: string; total: number; count: number; average: number }>;
    },
    filename: string = 'expense-summary.csv'
  ): void {
    const data = [
      { Metric: 'Total Expenses', Value: summary.totalExpenses.toFixed(2) },
      { Metric: 'Average Expense', Value: summary.averageExpense.toFixed(2) },
      { Metric: 'Transaction Count', Value: summary.transactionCount },
      { Metric: '', Value: '' }, // Empty row
      { Metric: 'Category', Value: 'Total Amount' },
      ...summary.categoryStats.map(stat => ({
        Metric: CATEGORY_LABELS[stat.category as any] || stat.category,
        Value: stat.total.toFixed(2),
      })),
    ];

    const csv = Papa.unparse(data);
    this.downloadFile(csv, filename, 'text/csv');
  }
}

export default ExportService;
