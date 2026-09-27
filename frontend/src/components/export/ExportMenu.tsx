import { useState } from 'react';
import type { Expense, CategoryBudget } from '../../types';
import ExportService from '../../services/export';
import { CATEGORY_LABELS } from '../../utils/constants';

interface ExportMenuProps {
  expenses: Expense[];
  budgets?: CategoryBudget[];
  totalExpenses: number;
  averageExpense: number;
  categoryStats: Array<{
    category: any;
    total: number;
    count: number;
    average: number;
  }>;
  onPDFExport?: () => void;
}

export default function ExportMenu({ expenses, budgets = [], totalExpenses, averageExpense, categoryStats, onPDFExport }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'excel' | 'json') => {
    if (expenses.length === 0) {
      alert('No expenses to export');
      return;
    }

    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      
      switch (format) {
        case 'csv':
          ExportService.exportToCSV(expenses, `expenses_${timestamp}.csv`);
          break;
        case 'excel':
          ExportService.exportToExcel(expenses, budgets, `expenses_${timestamp}.xlsx`);
          break;
        case 'json':
          ExportService.exportToJSON(expenses, budgets, `expenses_${timestamp}.json`);
          break;
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSummary = () => {
    if (expenses.length === 0) {
      alert('No data to export');
      return;
    }

    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const summary = {
        totalExpenses,
        averageExpense,
        transactionCount: expenses.length,
        categoryStats: categoryStats.map(stat => ({
          category: CATEGORY_LABELS[stat.category] || stat.category,
          total: stat.total,
          count: stat.count,
          average: stat.average,
        })),
      };

      ExportService.exportSummaryToCSV(summary as any, `expense-summary_${timestamp}.csv`);
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export summary');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-2 w-56 card-surface z-20">
            <div className="p-2">
              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-paper rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={isExporting}
                className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-paper rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export as Excel
              </button>
              <button
                onClick={() => handleExport('json')}
                disabled={isExporting}
                className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-paper rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export as JSON
              </button>
              <div className="border-t border-line my-2" />
              {onPDFExport && (
                <button
                  onClick={() => {
                    onPDFExport();
                    setIsOpen(false);
                  }}
                  disabled={isExporting}
                  className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-paper rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Generate PDF Report
                </button>
              )}
              {onPDFExport && <div className="border-t border-line my-2" />}
              <button
                onClick={handleExportSummary}
                disabled={isExporting}
                className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-paper rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export Summary
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
