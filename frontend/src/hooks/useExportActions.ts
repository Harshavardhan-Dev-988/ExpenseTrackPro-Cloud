/**
 * The header menu's export actions (CSV / Excel / JSON / summary), with a
 * toast for every outcome instead of the old `alert()` calls. The PDF
 * report has its own modal (PDFReportGenerator) and isn't handled here.
 */
import { useCallback } from 'react';
import type { CategoryBudget, CategoryType, Expense } from '../types';
import ExportService from '../services/export';
import { CATEGORY_LABELS } from '../utils/constants';
import { useToast, errorMessage } from '../components/ui/toastContext';

export type ExportFormat = 'csv' | 'excel' | 'json';

const FORMAT_LABEL: Record<ExportFormat, string> = { csv: 'CSV', excel: 'Excel', json: 'JSON' };

interface Args {
  expenses: Expense[];
  budgets: CategoryBudget[];
  totalExpenses: number;
  averageExpense: number;
  categoryStats: Array<{ category: CategoryType; total: number; count: number; average: number }>;
}

// Let the toast/spinner paint before the (synchronous, sometimes heavy)
// file generation runs on the main thread.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

export function useExportActions({ expenses, budgets, totalExpenses, averageExpense, categoryStats }: Args) {
  const toast = useToast();

  const exportData = useCallback(
    async (format: ExportFormat) => {
      if (expenses.length === 0) {
        toast.info('Nothing to export yet', 'Add a few expenses first.');
        return;
      }
      const id = toast.loading(`Preparing ${FORMAT_LABEL[format]} export…`, `${expenses.length.toLocaleString('en-IN')} expenses`);
      await nextFrame();
      try {
        const timestamp = new Date().toISOString().split('T')[0];
        if (format === 'csv') ExportService.exportToCSV(expenses, `expenses_${timestamp}.csv`);
        if (format === 'excel') ExportService.exportToExcel(expenses, budgets, `expenses_${timestamp}.xlsx`);
        if (format === 'json') ExportService.exportToJSON(expenses, budgets, `expenses_${timestamp}.json`);
        toast.update(id, {
          kind: 'success',
          title: `${FORMAT_LABEL[format]} file downloaded`,
          description: `${expenses.length.toLocaleString('en-IN')} expenses exported.`,
        });
      } catch (error) {
        console.error('Export failed:', error);
        toast.update(id, { kind: 'error', title: 'Export failed', description: errorMessage(error) });
      }
    },
    [expenses, budgets, toast]
  );

  const exportSummary = useCallback(async () => {
    if (expenses.length === 0) {
      toast.info('Nothing to summarise yet', 'Add a few expenses first.');
      return;
    }
    const id = toast.loading('Preparing summary…');
    await nextFrame();
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const summary = {
        totalExpenses,
        averageExpense,
        transactionCount: expenses.length,
        categoryStats: categoryStats.map((stat) => ({
          category: CATEGORY_LABELS[stat.category] || stat.category,
          total: stat.total,
          count: stat.count,
          average: stat.average,
        })),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ExportService.exportSummaryToCSV(summary as any, `expense-summary_${timestamp}.csv`);
      toast.update(id, { kind: 'success', title: 'Summary downloaded', description: 'Category totals as CSV.' });
    } catch (error) {
      console.error('Export failed:', error);
      toast.update(id, { kind: 'error', title: 'Summary export failed', description: errorMessage(error) });
    }
  }, [expenses, totalExpenses, averageExpense, categoryStats, toast]);

  return { exportData, exportSummary };
}
