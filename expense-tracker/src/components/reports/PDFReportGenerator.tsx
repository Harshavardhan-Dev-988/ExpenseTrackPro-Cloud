import { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import {
  generatePDFReport,
  generateSimplePDFReport,
  type PDFReportConfig,
} from '../../services/pdfGenerator';
import type { Expense, CategoryBudget } from '../../types';
import CategoryPieChart from '../charts/CategoryPieChart';
import MonthlyTrendChart from '../charts/MonthlyTrendChart';
import PaymentMethodChart from '../charts/PaymentMethodChart';
import DailyExpensesChart from '../charts/DailyExpensesChart';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useSettings } from '../../hooks/useSettings';

interface PDFReportGeneratorProps {
  expenses: Expense[];
  budgets: CategoryBudget[];
  onClose: () => void;
}

export default function PDFReportGenerator({
  expenses,
  budgets,
  onClose,
}: PDFReportGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'full' | 'simple'>('simple');
  const [includeSections, setIncludeSections] = useState({
    summary: true,
    categories: true,
    trends: true,
    payments: true,
    daily: true,
  });

  // Refs for chart elements (hidden)
  const categoryChartRef = useRef<HTMLDivElement>(null);
  const trendChartRef = useRef<HTMLDivElement>(null);
  const paymentChartRef = useRef<HTMLDivElement>(null);
  const dailyChartRef = useRef<HTMLDivElement>(null);

  // Calculate analytics data for charts
  const { categoryStats } = useAnalytics(expenses);
  const { settings } = useSettings();

  const handleSectionToggle = (section: keyof typeof includeSections) => {
    setIncludeSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const captureCharts = async () => {
    const images: {
      categoryChart?: string;
      trendChart?: string;
      paymentChart?: string;
      dailyChart?: string;
    } = {};

    try {
      if (includeSections.categories && categoryChartRef.current) {
        const canvas = await html2canvas(categoryChartRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
        });
        images.categoryChart = canvas.toDataURL('image/png');
      }

      if (includeSections.trends && trendChartRef.current) {
        const canvas = await html2canvas(trendChartRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
        });
        images.trendChart = canvas.toDataURL('image/png');
      }

      if (includeSections.payments && paymentChartRef.current) {
        const canvas = await html2canvas(paymentChartRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
        });
        images.paymentChart = canvas.toDataURL('image/png');
      }

      if (includeSections.daily && dailyChartRef.current) {
        const canvas = await html2canvas(dailyChartRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
        });
        images.dailyChart = canvas.toDataURL('image/png');
      }
    } catch (err) {
      console.error('Failed to capture charts:', err);
      throw new Error('Failed to capture charts');
    }

    return images;
  };

  const handleGeneratePDF = async () => {
    setLoading(true);
    setError(null);

    try {
      const config: PDFReportConfig = {
        expenses,
        budgets,
        includeSections,
      };

      if (reportType === 'simple') {
        // Generate simple text-based report
        await generateSimplePDFReport(config);
        // Show success message briefly before closing
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        // Wait for charts to render properly
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Capture charts
        const chartImages = await captureCharts();

        // Validate we have at least one chart if sections are selected
        const hasCharts = Object.values(chartImages).some(img => img !== undefined);
        if (!hasCharts && !includeSections.summary) {
          throw new Error('No charts available to generate. Please select at least one section.');
        }

        // Generate full report with charts
        await generatePDFReport(config, chartImages);

        // Show success message briefly before closing
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      setError((err as Error).message || 'Failed to generate PDF report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="card-surface w-full max-w-3xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-paper [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate">
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 z-10 rounded-t-ledger">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-ink">
              📄 Generate PDF report
            </h2>
            <button
              onClick={onClose}
              className="text-slate hover:text-ink transition-colors text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-slate mt-1">
            Create a comprehensive PDF report of your expenses
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-ember/10 border border-ember/30 rounded-lg p-4">
              <p className="text-ember-strong dark:text-ember text-sm">{error}</p>
            </div>
          )}

          {/* Report Type Selection */}
          <div className="bg-paper rounded-lg p-5">
            <h3 className="font-display text-lg font-semibold text-ink mb-3">
              Report type
            </h3>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border-2 border-line rounded-lg cursor-pointer hover:border-pine transition-colors">
                <input
                  type="radio"
                  name="reportType"
                  value="simple"
                  checked={reportType === 'simple'}
                  onChange={(e) => setReportType(e.target.value as 'simple')}
                  className="mt-1 accent-pine"
                />
                <div>
                  <div className="font-medium text-ink">
                    📊 Simple report (recommended)
                  </div>
                  <div className="text-sm text-slate">
                    Text-based summary with KPIs, top categories, and payment methods. Fast and
                    reliable.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border-2 border-line rounded-lg cursor-pointer hover:border-pine transition-colors">
                <input
                  type="radio"
                  name="reportType"
                  value="full"
                  checked={reportType === 'full'}
                  onChange={(e) => setReportType(e.target.value as 'full')}
                  className="mt-1 accent-pine"
                />
                <div>
                  <div className="font-medium text-ink">
                    📈 Full report with charts
                  </div>
                  <div className="text-sm text-slate">
                    Multi-page report with captured charts and detailed insights. May take longer
                    to generate.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Section Selection (only for full report) */}
          {reportType === 'full' && (
            <div className="bg-paper rounded-lg p-5">
              <h3 className="font-display text-lg font-semibold text-ink mb-3">
                Include sections
              </h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSections.summary}
                    onChange={() => handleSectionToggle('summary')}
                    className="w-4 h-4 accent-pine"
                  />
                  <span className="text-ink">
                    📊 Executive summary (KPIs & overview)
                  </span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSections.categories}
                    onChange={() => handleSectionToggle('categories')}
                    className="w-4 h-4 accent-pine"
                  />
                  <span className="text-ink">
                    📈 Category analysis (pie chart & breakdown)
                  </span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSections.trends}
                    onChange={() => handleSectionToggle('trends')}
                    className="w-4 h-4 accent-pine"
                  />
                  <span className="text-ink">
                    📉 Time trends (monthly spending chart)
                  </span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSections.payments}
                    onChange={() => handleSectionToggle('payments')}
                    className="w-4 h-4 accent-pine"
                  />
                  <span className="text-ink">
                    💳 Payment methods (distribution chart)
                  </span>
                </label>
                <label className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-surface transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSections.daily}
                    onChange={() => handleSectionToggle('daily')}
                    className="w-4 h-4 accent-pine"
                  />
                  <span className="text-ink">
                    📅 Daily expenses (current month detail)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Report Info */}
          <div className="bg-paper rounded-lg p-4">
            <h4 className="font-display font-semibold text-ink mb-2">Report info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm font-mono">
              <div>
                <span className="text-slate">Expenses:</span>
                <p className="font-medium text-ink tabular">{expenses.length}</p>
              </div>
              <div>
                <span className="text-slate">Date:</span>
                <p className="font-medium text-ink tabular">
                  {format(new Date(), 'MMM dd, yyyy')}
                </p>
              </div>
              {expenses.length > 0 && (
                <>
                  <div>
                    <span className="text-slate">Period start:</span>
                    <p className="font-medium text-ink tabular">
                      {format(
                        new Date(Math.min(...expenses.map((e) => new Date(e.date).getTime()))),
                        'MMM dd, yyyy'
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate">Period end:</span>
                    <p className="font-medium text-ink tabular">
                      {format(
                        new Date(Math.max(...expenses.map((e) => new Date(e.date).getTime()))),
                        'MMM dd, yyyy'
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Hidden charts for capture */}
          {reportType === 'full' && (
            <div className="hidden">
              <div ref={categoryChartRef} style={{ width: '800px', padding: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#17211D' }}>
                  Category Distribution
                </h3>
                <CategoryPieChart
                  categoryStats={categoryStats.filter(stat => stat.total > 0)}
                  currency={settings.currency}
                />
              </div>
              <div ref={trendChartRef} style={{ width: '800px', padding: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#17211D' }}>
                  Monthly Spending Trend
                </h3>
                <MonthlyTrendChart expenses={expenses} currency={settings.currency} />
              </div>
              <div ref={paymentChartRef} style={{ width: '800px', padding: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#17211D' }}>
                  Payment Method Distribution
                </h3>
                <PaymentMethodChart expenses={expenses} currency={settings.currency} />
              </div>
              <div ref={dailyChartRef} style={{ width: '800px', padding: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px', color: '#17211D' }}>
                  Daily Expenses (Current Month)
                </h3>
                <DailyExpensesChart expenses={expenses} />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGeneratePDF}
            disabled={loading || expenses.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-pine text-paper text-lg font-semibold shadow-ledger hover:bg-pine-strong disabled:bg-line disabled:text-slate disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-200"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Generating PDF...
              </span>
            ) : (
              '📥 Download PDF report'
            )}
          </button>

          {expenses.length === 0 && (
            <p className="text-center text-sm text-slate">
              Add some expenses first to generate a report
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-paper px-6 py-4 border-t border-line rounded-b-ledger">
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong disabled:bg-line disabled:text-slate disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
