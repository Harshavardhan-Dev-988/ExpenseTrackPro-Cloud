import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import type { Expense, CategoryBudget } from '../types';
import { CATEGORY_LABELS } from '../utils/constants';

export interface PDFReportConfig {
  expenses: Expense[];
  budgets: CategoryBudget[];
  includeSections: {
    summary: boolean;
    categories: boolean;
    trends: boolean;
    payments: boolean;
    daily: boolean;
  };
}

/**
 * Add header to PDF page
 */
function addHeader(doc: jsPDF, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header background — ledger pine
  doc.setFillColor(47, 77, 63);
  doc.rect(0, 0, pageWidth, 20, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Expense Tracker Report', 15, 13);

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(), 'MMM dd, yyyy'), pageWidth - 15, 13, { align: 'right' });

  // Footer — ledger slate
  doc.setTextColor(92, 107, 100);
  doc.setFontSize(8);
  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );
}

/**
 * Add section title
 */
function addSectionTitle(doc: jsPDF, title: string, yPos: number): number {
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 60, 49); // ledger pine-strong
  doc.text(title, 15, yPos);
  return yPos + 8;
}

/**
 * Calculate comprehensive statistics
 */
function calculateStats(expenses: Expense[]) {
  if (expenses.length === 0) {
    return {
      total: 0,
      average: 0,
      count: 0,
      highest: 0,
      lowest: 0,
      categoryStats: [],
      paymentStats: [],
    };
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const average = total / expenses.length;
  const amounts = expenses.map(e => e.amount).sort((a, b) => a - b);
  const highest = amounts[amounts.length - 1];
  const lowest = amounts[0];

  // Category statistics
  const categoryMap = new Map<string, { total: number; count: number }>();
  expenses.forEach(expense => {
    const current = categoryMap.get(expense.category) || { total: 0, count: 0 };
    categoryMap.set(expense.category, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });
  });

  const categoryStats = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      total: stats.total,
      count: stats.count,
      percentage: (stats.total / total) * 100,
    }))
    .sort((a, b) => b.total - a.total);

  // Payment method statistics
  const paymentMap = new Map<string, { total: number; count: number }>();
  expenses.forEach(expense => {
    const method = expense.paymentMethod || 'cash';
    const current = paymentMap.get(method) || { total: 0, count: 0 };
    paymentMap.set(method, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });
  });

  const paymentStats = Array.from(paymentMap.entries())
    .map(([method, stats]) => ({
      method,
      total: stats.total,
      count: stats.count,
      percentage: (stats.total / total) * 100,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total,
    average,
    count: expenses.length,
    highest,
    lowest,
    categoryStats,
    paymentStats,
  };
}

/**
 * Generate Executive Summary page
 */
function generateSummaryPage(
  doc: jsPDF,
  expenses: Expense[],
  stats: ReturnType<typeof calculateStats>,
  pageNumber: number,
  totalPages: number
) {
  addHeader(doc, pageNumber, totalPages);
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 30;

  // Section title
  yPos = addSectionTitle(doc, 'Executive Summary', yPos);
  yPos += 5;

  // KPI Cards
  const cardWidth = (pageWidth - 50) / 3;
  const cardHeight = 30;
  const cardSpacing = 10;

  const kpis = [
    {
      label: 'Total Expenses',
      value: `₹${stats.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      color: [47, 77, 63] as [number, number, number], // ledger pine
    },
    {
      label: 'Transactions',
      value: stats.count.toString(),
      color: [169, 118, 46] as [number, number, number], // ledger brass
    },
    {
      label: 'Average Expense',
      value: `₹${stats.average.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      color: [36, 60, 49] as [number, number, number], // ledger pine-strong
    },
  ];

  kpis.forEach((kpi, index) => {
    const xPos = 15 + index * (cardWidth + cardSpacing);
    doc.setFillColor(...kpi.color);
    doc.roundedRect(xPos, yPos, cardWidth, cardHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label, xPos + cardWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, xPos + cardWidth / 2, yPos + 22, { align: 'center' });
  });

  yPos += cardHeight + 15;

  // Date range
  if (expenses.length > 0) {
    const dates = expenses.map(e => new Date(e.date));
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    doc.setTextColor(92, 107, 100); // ledger slate
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Period: ${format(earliest, 'MMM dd, yyyy')} - ${format(latest, 'MMM dd, yyyy')}`,
      15,
      yPos
    );
    yPos += 15;
  }

  // Top Categories
  yPos = addSectionTitle(doc, 'Top Spending Categories', yPos);
  yPos += 5;
  doc.setTextColor(23, 33, 29); // ledger ink
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  stats.categoryStats.slice(0, 8).forEach((cat) => {
    const barWidth = (cat.percentage / 100) * (pageWidth - 100);
    doc.text(cat.label.substring(0, 20), 15, yPos + 4);
    doc.setFillColor(47, 77, 63); // ledger pine
    doc.rect(70, yPos, barWidth, 6, 'F');
    doc.text(
      `₹${cat.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${cat.percentage.toFixed(1)}%)`,
      pageWidth - 15,
      yPos + 4,
      { align: 'right' }
    );
    yPos += 10;
  });

  yPos += 10;

  // Payment Methods
  if (yPos < 250) {
    yPos = addSectionTitle(doc, 'Payment Method Distribution', yPos);
    yPos += 5;

    const methodLabels: Record<string, string> = {
      cash: 'Cash',
      card: 'Card',
      upi: 'UPI',
      netbanking: 'Net Banking',
      cheque: 'Cheque',
      other: 'Other',
    };

    stats.paymentStats.forEach((payment) => {
      if (yPos > 270) return;
      doc.text(methodLabels[payment.method] || payment.method, 15, yPos + 4);
      doc.text(
        `₹${payment.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${payment.percentage.toFixed(1)}%)`,
        pageWidth - 15,
        yPos + 4,
        { align: 'right' }
      );
      yPos += 8;
    });
  }
}

/**
 * Add chart image to PDF
 */
function addChartPage(
  doc: jsPDF,
  title: string,
  chartImage: string,
  insights: string[],
  pageNumber: number,
  totalPages: number
) {
  addHeader(doc, pageNumber, totalPages);
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 30;

  yPos = addSectionTitle(doc, title, yPos);
  yPos += 5;

  const imgWidth = pageWidth - 30;
  const imgHeight = 120;

  try {
    doc.addImage(chartImage, 'PNG', 15, yPos, imgWidth, imgHeight);
    yPos += imgHeight + 10;
  } catch (error) {
    console.error('Failed to add chart image:', error);
    doc.setTextColor(179, 73, 47); // ledger ember — error state
    doc.setFontSize(10);
    doc.text('Chart could not be generated', pageWidth / 2, yPos + 60, { align: 'center' });
    yPos += imgHeight + 10;
  }

  // Insights
  if (insights && insights.length > 0 && yPos < 240) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(36, 60, 49); // ledger pine-strong
    doc.text('Key Insights:', 15, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(23, 33, 29); // ledger ink

    insights.forEach((insight) => {
      if (yPos < 270) {
        doc.text(`• ${insight}`, 20, yPos);
        yPos += 6;
      }
    });
  }
}

/**
 * Generate PDF report with charts
 */
export async function generatePDFReport(
  config: PDFReportConfig,
  chartImages: {
    categoryChart?: string;
    trendChart?: string;
    paymentChart?: string;
    dailyChart?: string;
  }
): Promise<void> {
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const stats = calculateStats(config.expenses);

    // Count total pages
    let totalPages = 0;
    if (config.includeSections.summary) totalPages++;
    if (config.includeSections.categories && chartImages.categoryChart) totalPages++;
    if (config.includeSections.trends && chartImages.trendChart) totalPages++;
    if (config.includeSections.payments && chartImages.paymentChart) totalPages++;
    if (config.includeSections.daily && chartImages.dailyChart) totalPages++;

    let pageNumber = 1;

    // Page 1: Executive Summary
    if (config.includeSections.summary) {
      generateSummaryPage(doc, config.expenses, stats, pageNumber, totalPages);
      pageNumber++;
    }

    // Page 2: Category Analysis
    if (config.includeSections.categories && chartImages.categoryChart) {
      if (pageNumber > 1) doc.addPage();
      const insights = [
        `Top spending category: ${stats.categoryStats[0]?.label || 'N/A'}`,
        `Total categories used: ${stats.categoryStats.length}`,
        `Largest expense: ₹${stats.highest.toLocaleString('en-IN')}`,
        `Smallest expense: ₹${stats.lowest.toLocaleString('en-IN')}`,
      ];
      addChartPage(doc, 'Category Analysis', chartImages.categoryChart, insights, pageNumber, totalPages);
      pageNumber++;
    }

    // Page 3: Time Trends
    if (config.includeSections.trends && chartImages.trendChart) {
      if (pageNumber > 1) doc.addPage();
      const insights = [
        `Total transactions: ${stats.count}`,
        `Average per transaction: ₹${stats.average.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
        `Spending range: ₹${stats.lowest.toLocaleString('en-IN')} - ₹${stats.highest.toLocaleString('en-IN')}`,
      ];
      addChartPage(doc, 'Spending Trends', chartImages.trendChart, insights, pageNumber, totalPages);
      pageNumber++;
    }

    // Page 4: Payment Methods
    if (config.includeSections.payments && chartImages.paymentChart) {
      if (pageNumber > 1) doc.addPage();
      const insights = [
        `Payment methods used: ${stats.paymentStats.length}`,
        `Most used: ${stats.paymentStats[0]?.method || 'N/A'} (${stats.paymentStats[0]?.percentage.toFixed(1)}%)`,
      ];
      addChartPage(doc, 'Payment Methods', chartImages.paymentChart, insights, pageNumber, totalPages);
      pageNumber++;
    }

    // Page 5: Daily Expenses
    if (config.includeSections.daily && chartImages.dailyChart) {
      if (pageNumber > 1) doc.addPage();
      const insights = [
        `Daily expense tracking for current month`,
        `Active spending days: ${stats.count}`,
      ];
      addChartPage(doc, 'Daily Expenses', chartImages.dailyChart, insights, pageNumber, totalPages);
    }

    // Save PDF
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const filename = `expense-report-${dateStr}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('Failed to generate PDF report');
  }
}

/**
 * Generate simple text-based PDF report
 */
export async function generateSimplePDFReport(config: PDFReportConfig): Promise<void> {
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const stats = calculateStats(config.expenses);

    if (config.expenses.length === 0) {
      addHeader(doc, 1, 1);
      doc.setFontSize(14);
      doc.setTextColor(92, 107, 100); // ledger slate
      doc.text('No expenses to report', doc.internal.pageSize.getWidth() / 2, 100, { align: 'center' });
    } else {
      generateSummaryPage(doc, config.expenses, stats, 1, 1);
    }

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    doc.save(`expense-report-simple-${dateStr}.pdf`);
  } catch (error) {
    console.error('Simple PDF generation error:', error);
    throw new Error('Failed to generate simple PDF report');
  }
}
