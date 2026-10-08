/**
 * PDF expense report, drawn natively with jsPDF.
 *
 * Every chart in here is drawn as vector shapes straight onto the page.
 * The previous version screenshotted hidden on-screen charts with
 * html2canvas, which fails outright on this app: Tailwind v4 emits
 * `oklab()`/`color-mix()` colours that html2canvas 1.x can't parse, so the
 * "full report" threw "Failed to capture charts" every time. Drawing
 * directly is also faster, sharper at any zoom, and keeps the file small.
 *
 * jsPDF's built-in fonts only cover Latin-1, so the rupee sign is written
 * as "Rs" and any other characters outside that range are replaced.
 */
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { CategoryBudget, CategoryStats, CategoryType, Expense } from '../types';
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../utils/constants';
import { getCategoryGroup, getCategoryGroupBreakdown } from '../utils/helpers';
import {
  bucketSeries,
  budgetWindow,
  computeBudgetStatus,
  inPeriod,
  previousPeriod,
  sumAmount,
  type ResolvedPeriod,
} from '../utils/period';

export interface ReportSections {
  summary: boolean;
  trend: boolean;
  categories: boolean;
  payments: boolean;
  budgets: boolean;
  largest: boolean;
  transactions: boolean;
}

export interface PDFReportOptions {
  /** Every expense the person has (used for the comparison period). */
  allExpenses: Expense[];
  budgets: CategoryBudget[];
  period: ResolvedPeriod;
  currency: string;
  sections: ReportSections;
}

type RGB = [number, number, number];
const C: Record<string, RGB> = {
  pine: [47, 77, 63],
  pineStrong: [36, 60, 49],
  brass: [169, 118, 46],
  ember: [179, 73, 47],
  ink: [23, 33, 29],
  slate: [92, 107, 100],
  line: [217, 221, 214],
  paper: [238, 241, 238],
  white: [255, 255, 255],
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // side margin
const CONTENT_W = PAGE_W - M * 2;
const TOP = 26; // first usable y below the header band
const BOTTOM = PAGE_H - 16; // last usable y above the footer

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Keep text inside what jsPDF's standard (Latin-1) fonts can draw. */
function clean(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function currencyPrefix(currency: string): string {
  switch (currency) {
    case 'INR':
      return 'Rs ';
    case 'USD':
      return '$';
    case 'GBP':
      return '£';
    default:
      return `${currency} `;
  }
}

function makeMoney(currency: string) {
  const prefix = currencyPrefix(currency);
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return (n: number, opts: { decimals?: 'auto' | 0 | 2 } = {}) => {
    const mode = opts.decimals ?? 'auto';
    const frac = mode === 'auto' ? (Math.abs(n % 1) > 0.004 ? 2 : 0) : mode;
    const body = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: frac, maximumFractionDigits: frac });
    return `${n < 0 ? '-' : ''}${prefix}${body}`;
  };
}

/** Short axis labels: 1.2L / 45K for rupees, 1.2M / 45K otherwise. */
function makeCompact(currency: string) {
  const prefix = currencyPrefix(currency).trim();
  return (n: number) => {
    const a = Math.abs(n);
    if (currency === 'INR') {
      if (a >= 1e7) return `${prefix} ${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
      if (a >= 1e5) return `${prefix} ${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
    } else if (a >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${prefix}${currency === 'INR' ? ' ' : ''}${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
    return `${prefix}${currency === 'INR' ? ' ' : ''}${Math.round(n)}`;
  };
}

/** Nice round axis maximum + step for a bar chart. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { top: step * ticks, step };
}

class ReportWriter {
  doc: jsPDF;
  y = TOP;
  private periodLabel: string;
  constructor(periodLabel: string) {
    this.periodLabel = periodLabel;
    this.doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    this.drawHeader();
  }

  fill(c: RGB) {
    this.doc.setFillColor(c[0], c[1], c[2]);
  }
  stroke(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2]);
  }
  color(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }
  font(size: number, style: 'normal' | 'bold' = 'normal') {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
  }
  text(t: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' }) {
    this.doc.text(clean(t), x, y, opts);
  }
  /** Truncate to fit `maxW` mm at the current font size. */
  fit(t: string, maxW: number) {
    let s = clean(t);
    if (this.doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && this.doc.getTextWidth(`${s}...`) > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  }

  drawHeader() {
    this.fill(C.pine);
    this.doc.rect(0, 0, PAGE_W, 14, 'F');
    this.color(C.white);
    this.font(10.5, 'bold');
    this.text('ExpenseTrack Pro', M, 9);
    this.font(8.5);
    this.text(`Expense report  |  ${this.periodLabel}`, PAGE_W - M, 9, { align: 'right' });
  }

  newPage() {
    this.doc.addPage();
    this.drawHeader();
    this.y = TOP;
  }

  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }

  /** `keepWith`: room to reserve for the content that follows, so a title is never stranded at the foot of a page. */
  sectionTitle(title: string, subtitle?: string, keepWith = 32) {
    this.ensure((subtitle ? 16 : 12) + keepWith);
    this.color(C.ink);
    this.font(13, 'bold');
    this.text(title, M, this.y + 5);
    if (subtitle) {
      this.color(C.slate);
      this.font(8.5);
      this.text(subtitle, M, this.y + 10.5);
      this.y += 15;
    } else {
      this.y += 10;
    }
  }

  footers() {
    const total = this.doc.getNumberOfPages();
    const stamp = `Generated ${format(new Date(), 'MMM d, yyyy, h:mm a')}`;
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.stroke(C.line);
      this.doc.setLineWidth(0.2);
      this.doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
      this.color(C.slate);
      this.font(7.5);
      this.text(stamp, M, PAGE_H - 6.5);
      this.text(`Page ${i} of ${total}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' });
    }
  }

  /**
   * A simple table with a header row, zebra rows and automatic page
   * breaks (the header repeats on each new page).
   */
  table(
    columns: { label: string; width: number; align?: 'left' | 'right'; color?: (row: string[], i: number) => RGB | undefined; bold?: boolean }[],
    rows: string[][],
    rowH = 7
  ) {
    const drawHead = () => {
      this.fill(C.paper);
      this.doc.rect(M, this.y, CONTENT_W, rowH, 'F');
      this.color(C.slate);
      this.font(7.5, 'bold');
      let x = M;
      columns.forEach((col) => {
        const tx = col.align === 'right' ? x + col.width - 2 : x + 2;
        this.text(col.label.toUpperCase(), tx, this.y + rowH - 2.4, { align: col.align === 'right' ? 'right' : 'left' });
        x += col.width;
      });
      this.y += rowH;
    };
    this.ensure(rowH * 2);
    drawHead();
    rows.forEach((row, r) => {
      if (this.y + rowH > BOTTOM) {
        this.newPage();
        drawHead();
      }
      if (r % 2 === 1) {
        this.fill([247, 248, 246]);
        this.doc.rect(M, this.y, CONTENT_W, rowH, 'F');
      }
      let x = M;
      columns.forEach((col, ci) => {
        this.font(8.5, col.bold ? 'bold' : 'normal');
        this.color(col.color?.(row, r) ?? C.ink);
        const content = this.fit(row[ci] ?? '', col.width - 4);
        const tx = col.align === 'right' ? x + col.width - 2 : x + 2;
        this.text(content, tx, this.y + rowH - 2.3, { align: col.align === 'right' ? 'right' : 'left' });
        x += col.width;
      });
      this.y += rowH;
    });
    this.stroke(C.line);
    this.doc.setLineWidth(0.2);
    this.doc.line(M, this.y, PAGE_W - M, this.y);
    this.y += 6;
  }

  /** Horizontal bar list: label | bar | value. */
  barList(items: { label: string; value: number; valueText: string; color: RGB; note?: string }[], labelW = 52, valueW = 42) {
    const max = Math.max(...items.map((i) => i.value), 1);
    const barX = M + labelW;
    const barW = CONTENT_W - labelW - valueW;
    const rowH = 8;
    items.forEach((item) => {
      this.ensure(rowH);
      const cy = this.y + rowH / 2;
      this.fill(item.color);
      this.doc.circle(M + 1.6, cy - 0.3, 1.3, 'F');
      this.color(C.ink);
      this.font(8.5);
      this.text(this.fit(item.label, labelW - 7), M + 5, cy + 1);
      // track + bar
      this.fill([241, 243, 240]);
      this.doc.roundedRect(barX, cy - 2, barW, 3.6, 1.2, 1.2, 'F');
      const w = Math.max(0.8, (item.value / max) * barW);
      this.fill(item.color);
      this.doc.roundedRect(barX, cy - 2, w, 3.6, 1.2, 1.2, 'F');
      this.font(8.5, 'bold');
      this.color(C.ink);
      this.text(item.valueText, PAGE_W - M - (item.note ? 13 : 0), cy + 1, { align: 'right' });
      if (item.note) {
        this.font(8);
        this.color(C.slate);
        this.text(item.note, PAGE_W - M, cy + 1, { align: 'right' });
      }
      this.y += rowH;
    });
    this.y += 4;
  }
}

export function generateExpenseReport({ allExpenses, budgets, period, currency, sections }: PDFReportOptions): string {
  const money = makeMoney(currency);
  const compact = makeCompact(currency);
  const expenses = inPeriod(allExpenses, period.start, period.end).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const w = new ReportWriter(period.label);
  const { doc } = w;

  const total = sumAmount(expenses);
  const count = expenses.length;
  // For a period that's still running (this month/year), average over the
  // days that have actually happened, not the whole calendar span.
  const now = new Date();
  const shownEnd = period.end > now ? now : period.end;
  const activeDays = Math.max(1, Math.round((shownEnd.getTime() - period.start.getTime()) / 86400000));
  const largest = expenses.reduce<Expense | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);

  // ---- category stats ------------------------------------------------------
  const byCat = new Map<CategoryType, { total: number; count: number }>();
  expenses.forEach((e) => {
    const cur = byCat.get(e.category) || { total: 0, count: 0 };
    byCat.set(e.category, { total: cur.total + e.amount, count: cur.count + 1 });
  });
  const catStats = Array.from(byCat.entries())
    .map(([category, s]) => ({ category, total: s.total, count: s.count, average: s.total / s.count }))
    .sort((a, b) => b.total - a.total);
  const groups = getCategoryGroupBreakdown(catStats as unknown as CategoryStats[]);

  // ---- title block -----------------------------------------------------------
  w.color(C.ink);
  w.font(20, 'bold');
  w.text('Expense report', M, w.y + 6);
  w.color(C.slate);
  w.font(10);
  const rangeText =
    period.type === 'today'
      ? format(period.start, 'EEEE, MMM d, yyyy')
      : `${format(period.start, 'MMM d, yyyy')} - ${format(shownEnd, 'MMM d, yyyy')}`;
  w.text(`${period.label}   |   ${rangeText}   |   ${count.toLocaleString('en-IN')} entr${count === 1 ? 'y' : 'ies'}`, M, w.y + 13);
  w.y += 21;

  if (count === 0) {
    w.color(C.slate);
    w.font(11);
    w.text('No expenses were recorded in this period.', PAGE_W / 2, w.y + 30, { align: 'center' });
    w.footers();
    const name = `expense-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(name);
    return name;
  }

  // ---- summary KPIs ----------------------------------------------------------
  if (sections.summary) {
    const prev = previousPeriod(period);
    const prevTotal = prev ? sumAmount(inPeriod(allExpenses, prev.start, prev.end)) : 0;
    const kpis: { label: string; value: string; sub?: string; filled?: boolean }[] = [
      { label: 'Total spent', value: money(total, { decimals: 0 }), filled: true },
      { label: 'Entries', value: count.toLocaleString('en-IN'), sub: `${(count / activeDays).toFixed(1)} per day` },
      { label: 'Daily average', value: money(total / activeDays, { decimals: 0 }), sub: `over ${activeDays} days` },
      {
        label: 'Largest expense',
        value: largest ? money(largest.amount, { decimals: 0 }) : '-',
        sub: largest ? largest.description : undefined,
      },
    ];
    const gap = 4;
    const boxW = (CONTENT_W - gap * 3) / 4;
    const boxH = 25;
    kpis.forEach((k, i) => {
      const x = M + i * (boxW + gap);
      if (k.filled) {
        w.fill(C.pine);
        doc.roundedRect(x, w.y, boxW, boxH, 2.5, 2.5, 'F');
      } else {
        w.fill(C.white);
        w.stroke(C.line);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, w.y, boxW, boxH, 2.5, 2.5, 'FD');
      }
      w.color(k.filled ? [214, 228, 220] : C.slate);
      w.font(7.5, 'bold');
      w.text(k.label.toUpperCase(), x + 4, w.y + 7);
      w.color(k.filled ? C.white : C.ink);
      w.font(k.value.length > 13 ? 12 : 14, 'bold');
      w.text(k.value, x + 4, w.y + 15.5);
      if (k.sub) {
        w.color(k.filled ? [214, 228, 220] : C.slate);
        w.font(7.5);
        w.text(w.fit(k.sub, boxW - 8), x + 4, w.y + 21);
      }
    });
    w.y += boxH + 6;

    if (prev && prevTotal > 0) {
      const change = ((total - prevTotal) / prevTotal) * 100;
      const up = change >= 0;
      w.fill(up ? [250, 236, 232] : [230, 239, 234]);
      doc.roundedRect(M, w.y, CONTENT_W, 9, 2, 2, 'F');
      w.color(up ? C.ember : C.pineStrong);
      w.font(9, 'bold');
      w.text(`${up ? '+' : '-'}${Math.abs(change).toFixed(1)}%`, M + 4, w.y + 6);
      w.color(C.ink);
      w.font(9);
      w.text(
        `${up ? 'more' : 'less'} than ${prev.label} (${money(prevTotal, { decimals: 0 })})`,
        M + 4 + doc.getTextWidth(`${up ? '+' : '-'}${Math.abs(change).toFixed(1)}%`) + 3,
        w.y + 6
      );
      w.y += 15;
    }
  }

  // ---- spending over time ----------------------------------------------------
  if (sections.trend) {
    const { granularity, points } = bucketSeries(expenses, period.start, shownEnd);
    w.sectionTitle(
      'Spending over time',
      `${granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} totals`,
      62
    );
    const chartH = 58;
    w.ensure(chartH + 10);
    const axisW = 18;
    const x0 = M + axisW;
    const plotW = CONTENT_W - axisW;
    const top = w.y + 2;
    const plotH = chartH - 10;
    const maxV = Math.max(...points.map((p) => p.value), 1);
    const { top: yTop, step } = niceScale(maxV);

    // grid + y labels
    doc.setLineWidth(0.15);
    for (let v = 0; v <= yTop + 1e-6; v += step) {
      const gy = top + plotH - (v / yTop) * plotH;
      w.stroke(C.line);
      doc.line(x0, gy, PAGE_W - M, gy);
      w.color(C.slate);
      w.font(7);
      w.text(compact(v), x0 - 2, gy + 1, { align: 'right' });
    }
    // bars
    const n = points.length;
    const slot = plotW / n;
    const barW = Math.max(0.6, Math.min(9, slot * 0.68));
    const maxIdx = points.reduce((mi, p, i) => (p.value > points[mi].value ? i : mi), 0);
    points.forEach((p, i) => {
      const h = (p.value / yTop) * plotH;
      if (h <= 0) return;
      w.fill(i === maxIdx ? C.brass : C.pine);
      doc.rect(x0 + i * slot + (slot - barW) / 2, top + plotH - h, barW, h, 'F');
    });
    // peak label
    const peak = points[maxIdx];
    if (peak && peak.value > 0) {
      const px = x0 + maxIdx * slot + slot / 2;
      const py = top + plotH - (peak.value / yTop) * plotH - 1.5;
      w.color(C.brass);
      w.font(7, 'bold');
      w.text(compact(peak.value), Math.min(Math.max(px, x0 + 8), PAGE_W - M - 8), Math.max(py, top + 2), { align: 'center' });
    }
    // x labels (at most ~12)
    const every = Math.max(1, Math.ceil(n / 12));
    w.color(C.slate);
    w.font(6.8);
    points.forEach((p, i) => {
      if (i % every !== 0) return;
      const label = granularity === 'month' ? format(p.date, "MMM ''yy") : granularity === 'week' ? format(p.date, 'MMM d') : format(p.date, 'd MMM');
      w.text(label, x0 + i * slot + slot / 2, top + plotH + 5, { align: 'center' });
    });
    w.y += chartH + 4;
  }

  // ---- where it went ----------------------------------------------------------
  if (sections.categories) {
    w.sectionTitle('Where it went', `${groups.length} category groups, ${catStats.length} categories`);
    w.barList(
      groups.map((g) => ({
        label: g.name,
        value: g.value,
        valueText: money(g.value, { decimals: 0 }),
        note: `${((g.value / total) * 100).toFixed(0)}%`,
        color: hexToRgb(g.color),
      })),
      58,
      44
    );

    w.sectionTitle('Top categories');
    w.table(
      [
        { label: '#', width: 9 },
        { label: 'Category', width: 52, bold: true },
        { label: 'Group', width: 45, color: () => C.slate },
        { label: 'Entries', width: 20, align: 'right' },
        { label: 'Amount', width: 34, align: 'right', bold: true },
        { label: 'Share', width: 20, align: 'right', color: () => C.slate },
      ],
      catStats.slice(0, 15).map((s, i) => [
        String(i + 1),
        CATEGORY_LABELS[s.category] || s.category,
        getCategoryGroup(s.category)?.name || '-',
        s.count.toLocaleString('en-IN'),
        money(s.total, { decimals: 0 }),
        `${((s.total / total) * 100).toFixed(1)}%`,
      ])
    );
  }

  // ---- payment methods ----------------------------------------------------------
  if (sections.payments) {
    const byMethod = new Map<string, { total: number; count: number }>();
    expenses.forEach((e) => {
      const m = e.paymentMethod || 'other';
      const cur = byMethod.get(m) || { total: 0, count: 0 };
      byMethod.set(m, { total: cur.total + e.amount, count: cur.count + 1 });
    });
    const methods = Array.from(byMethod.entries()).sort((a, b) => b[1].total - a[1].total);
    const palette: RGB[] = [C.pine, C.brass, [92, 122, 138], [124, 106, 156], [156, 107, 79], C.slate];
    w.sectionTitle('How you paid', `${methods.length} payment method${methods.length === 1 ? '' : 's'}`);
    w.barList(
      methods.map(([m, s], i) => ({
        label: `${(PAYMENT_METHOD_LABELS as Record<string, string>)[m] || m}  (${s.count})`,
        value: s.total,
        valueText: money(s.total, { decimals: 0 }),
        note: `${((s.total / total) * 100).toFixed(0)}%`,
        color: palette[i % palette.length],
      })),
      58,
      44
    );
  }

  // ---- budgets ------------------------------------------------------------------
  if (sections.budgets && budgets.some((b) => b.isActive)) {
    const win = budgetWindow(period);
    const statuses = computeBudgetStatus(budgets, inPeriod(allExpenses, win.start, win.end), win.months);
    if (statuses.length) {
      const over = statuses.filter((s) => s.state === 'exceeded').length;
      w.sectionTitle(
        'Budgets',
        `Limits scaled to ${win.phrase}  |  ${over} of ${statuses.length} over limit`
      );
      w.table(
        [
          { label: 'Category', width: 58, bold: true },
          { label: 'Limit', width: 34, align: 'right' },
          { label: 'Spent', width: 34, align: 'right', bold: true },
          { label: 'Used', width: 22, align: 'right' },
          {
            label: 'Status',
            width: 32,
            align: 'right',
            color: (row) => (row[4] === 'Over limit' ? C.ember : row[4] === 'Close' ? C.brass : C.pineStrong),
          },
        ],
        statuses.map((s) => [
          CATEGORY_LABELS[s.category] || s.category,
          money(s.limit, { decimals: 0 }),
          money(s.spent, { decimals: 0 }),
          `${s.pct.toFixed(0)}%`,
          s.state === 'exceeded' ? 'Over limit' : s.state === 'warning' ? 'Close' : 'On track',
        ])
      );
    }
  }

  // ---- largest expenses ---------------------------------------------------------
  if (sections.largest) {
    const top = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 10);
    w.sectionTitle('Largest expenses');
    w.table(
      [
        { label: 'Date', width: 26 },
        { label: 'Description', width: 70 },
        { label: 'Category', width: 48, color: () => C.slate },
        { label: 'Amount', width: 36, align: 'right', bold: true },
      ],
      top.map((e) => [
        format(new Date(e.date), 'MMM d, yyyy'),
        e.description || '-',
        CATEGORY_LABELS[e.category] || e.category,
        money(e.amount),
      ])
    );
  }

  // ---- all transactions -----------------------------------------------------------
  if (sections.transactions) {
    w.newPage();
    w.sectionTitle('All transactions', `${count.toLocaleString('en-IN')} entries, oldest first`);
    w.table(
      [
        { label: 'Date', width: 24 },
        { label: 'Description', width: 66 },
        { label: 'Category', width: 42, color: () => C.slate },
        { label: 'Paid by', width: 20, color: () => C.slate },
        { label: 'Amount', width: 28, align: 'right', bold: true },
      ],
      expenses.map((e) => [
        format(new Date(e.date), 'dd MMM yyyy'),
        e.description || '-',
        CATEGORY_LABELS[e.category] || e.category,
        (PAYMENT_METHOD_LABELS as Record<string, string>)[e.paymentMethod || 'other'] || e.paymentMethod || '-',
        money(e.amount),
      ]),
      6.4
    );
  }

  w.footers();
  const slug = period.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = `expense-report-${slug || 'period'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(name);
  return name;
}
