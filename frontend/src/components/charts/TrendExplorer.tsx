/**
 * The dashboard's spending trend, with controls.
 *
 *  - Style: line, area or bars.  Granularity: auto, day, week or month.
 *  - Show: all spend, one group, or one category — or stack the biggest
 *    groups (or a group's categories) as separate series.
 *  - Overlays: the previous period lined up underneath, a moving average,
 *    a running (cumulative) total, and the budget pace for what's shown.
 *  - Drag across the plot to zoom into a stretch; hover for exact values;
 *    save the chart as a PNG.
 *
 * Drawn with D3 scales into React-rendered SVG. Colours are resolved from the
 * theme's CSS variables at render time and written as literal values, so the
 * PNG export (an SVG → canvas copy) looks exactly like the screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as d3 from 'd3';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { CategoryBudget, Expense } from '../../types';
import { CATEGORY_GROUPS, CATEGORY_LABELS } from '../../utils/constants';
import {
  categoriesForBudgetKey,
  getGroupById,
  groupBudgetKey,
  groupColor,
  groupOfCategory,
  isGroupBudgetKey,
  shades,
} from '../../utils/categoryRegistry';
import { formatMoney } from '../../utils/helpers';
import { previousPeriod, type ResolvedPeriod } from '../../utils/period';

type Style = 'line' | 'area' | 'bar';
type GranChoice = 'auto' | 'day' | 'week' | 'month';
type Gran = 'day' | 'week' | 'month';

interface Prefs {
  style: Style;
  gran: GranChoice;
  /** 'all', 'group:<id>' or a category id */
  show: string;
  stack: boolean;
  prev: boolean;
  avg: boolean;
  cumulative: boolean;
  budget: boolean;
}

const DEFAULT_PREFS: Prefs = {
  style: 'area',
  gran: 'auto',
  show: 'all',
  stack: false,
  prev: false,
  avg: false,
  cumulative: false,
  budget: false,
};
const PREFS_KEY = 'etp:trendPrefs';

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* per-browser convenience only */
  }
  return DEFAULT_PREFS;
}

interface TrendExplorerProps {
  /** Expenses already filtered to `period`. */
  expenses: Expense[];
  allExpenses: Expense[];
  period: ResolvedPeriod;
  budgets: CategoryBudget[];
  currency: string;
  height?: number;
}

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  match: (category: string) => boolean;
}

const AXIS_FORMAT: Record<Gran, string> = { day: 'd MMM', week: 'd MMM', month: "MMM ''yy" };
const HOVER_FORMAT: Record<Gran, string> = { day: 'EEE, d MMM yyyy', week: "'Week of' d MMM yyyy", month: 'MMMM yyyy' };

/** Theme colours as literal strings (see the file comment for why). */
function themeColors() {
  const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => {
    const raw = cs?.getPropertyValue(name).trim();
    return raw ? `rgb(${raw.split(/\s+/).join(',')})` : fallback;
  };
  return {
    ink: v('--ink', 'rgb(23,33,29)'),
    slate: v('--slate', 'rgb(92,107,100)'),
    line: v('--line', 'rgb(217,221,214)'),
    surface: v('--surface', 'rgb(255,255,255)'),
    paper: v('--paper', 'rgb(238,241,238)'),
    pine: v('--pine', 'rgb(47,77,63)'),
    brass: v('--brass', 'rgb(169,118,46)'),
    ember: v('--ember', 'rgb(179,73,47)'),
  };
}

const monthlyOf = (b: CategoryBudget) =>
  (b.budgetType || 'monthly') === 'yearly' ? (b.yearlyLimit || 0) / 12 : b.monthlyLimit || 0;

/** Monthly budget that applies to what's shown, without double-counting a
 * group budget and the category budgets inside it. */
function monthlyBudgetFor(show: string, budgets: CategoryBudget[]): number {
  const active = budgets.filter((b) => b.isActive);
  const groupBudget = (groupId: string) => active.find((b) => b.category === groupBudgetKey(groupId));
  if (show === 'all') {
    return active.reduce((sum, b) => {
      if (isGroupBudgetKey(b.category)) return sum + monthlyOf(b);
      const g = groupOfCategory(b.category);
      return g && groupBudget(g.id) ? sum : sum + monthlyOf(b);
    }, 0);
  }
  if (isGroupBudgetKey(show)) {
    const gb = active.find((b) => b.category === show);
    if (gb) return monthlyOf(gb);
    const cats = new Set(categoriesForBudgetKey(show));
    return active.filter((b) => cats.has(b.category)).reduce((s, b) => s + monthlyOf(b), 0);
  }
  const own = active.find((b) => b.category === show);
  return own ? monthlyOf(own) : 0;
}

const compactMoney = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return formatMoney(n, currency);
  }
};

export default function TrendExplorer({ expenses, allExpenses, period, budgets, currency, height = 260 }: TrendExplorerProps) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Zoom is remembered per view: a new period, granularity or series starts unzoomed.
  const [zoomState, setZoomState] = useState<{ key: string; range: [number, number] } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- buckets -------------------------------------------------------------
  const now = new Date();
  const end = period.end > now ? now : period.end;
  const spanDays = Math.max(1, differenceInCalendarDays(end, period.start) + 1);
  const autoGran: Gran = spanDays <= 62 ? 'day' : spanDays <= 400 ? 'week' : 'month';
  const dayAllowed = spanDays <= 1100;
  const gran: Gran = prefs.gran === 'auto' ? autoGran : prefs.gran === 'day' && !dayAllowed ? 'week' : prefs.gran;

  const startMs = period.start.getTime();
  // Day-rounded so it doesn't change on every render while "now" ticks on.
  const endMs = startOfDay(end).getTime();
  const viewKey = `${startMs}|${endMs}|${gran}|${prefs.show}`;
  const zoom = zoomState?.key === viewKey ? zoomState.range : null;
  const setZoom = (range: [number, number] | null) => setZoomState(range ? { key: viewKey, range } : null);

  const keyOf = (d: Date) =>
    gran === 'day' ? startOfDay(d) : gran === 'week' ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d);
  const buckets = useMemo(() => {
    const out: Date[] = [];
    let cursor = keyOf(period.start);
    const last = keyOf(end).getTime();
    let guard = 0;
    while (cursor.getTime() <= last && guard++ < 1200) {
      out.push(cursor);
      cursor = gran === 'day' ? addDays(cursor, 1) : gran === 'week' ? addDays(cursor, 7) : startOfMonth(addDays(endOfMonth(cursor), 1));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, gran]);
  const indexOfTime = useMemo(() => new Map(buckets.map((b, i) => [b.getTime(), i])), [buckets]);

  // ---- what's shown ----------------------------------------------------------
  const showGroup = isGroupBudgetKey(prefs.show) ? getGroupById(prefs.show.slice(6)) : undefined;
  const showValid = prefs.show === 'all' || !!showGroup || !!CATEGORY_LABELS[prefs.show as keyof typeof CATEGORY_LABELS];
  const show = showValid ? prefs.show : 'all';
  const canStack = show === 'all' || !!showGroup;
  const stacked = prefs.stack && canStack;
  const inShow = (category: string) =>
    show === 'all' ? true : showGroup ? (showGroup.categories as string[]).includes(category) : category === show;

  const series: SeriesDef[] = useMemo(() => {
    const c = themeColors();
    if (!stacked) {
      const color = showGroup ? groupColor(showGroup) : show !== 'all' ? (groupOfCategory(show) ? groupColor(groupOfCategory(show)!) : c.pine) : c.pine;
      return [{ key: 'total', label: 'Spend', color, match: inShow }];
    }
    // Stack: top 5 groups (or a group's top 5 categories) + everything else.
    const totals = new Map<string, number>();
    for (const e of expenses) {
      if (!inShow(e.category)) continue;
      const k = showGroup ? e.category : groupOfCategory(e.category)?.id ?? '__other';
      totals.set(k, (totals.get(k) || 0) + e.amount);
    }
    const ranked = [...totals.entries()].filter(([k]) => k !== '__other').sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 5).map(([k]) => k);
    const topSet = new Set(top);
    const palette = showGroup ? shades(groupColor(showGroup), Math.max(top.length, 1)) : [];
    const defs: SeriesDef[] = top.map((k, i) => {
      if (showGroup) {
        return { key: k, label: CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS] || k, color: palette[i], match: (cat) => cat === k };
      }
      const g = getGroupById(k)!;
      return { key: k, label: g.name, color: groupColor(g), match: (cat) => groupOfCategory(cat)?.id === k };
    });
    const hasRest = ranked.length > top.length || totals.has('__other');
    if (hasRest) {
      defs.push({
        key: '__rest',
        label: 'Everything else',
        color: '#9AA59D',
        match: (cat) => inShow(cat) && !topSet.has(showGroup ? cat : groupOfCategory(cat)?.id ?? '__other'),
      });
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, show, stacked]);

  // ---- values -----------------------------------------------------------------
  const { rows, prevValues, budgetValues, avgValues } = useMemo(() => {
    const n = buckets.length;
    const perSeries = series.map(() => new Array<number>(n).fill(0));
    for (const e of expenses) {
      const i = indexOfTime.get(keyOf(new Date(e.date)).getTime());
      if (i === undefined) continue;
      const s = series.findIndex((d) => d.match(e.category));
      if (s >= 0) perSeries[s][i] += e.amount;
    }
    const cum = (arr: number[]) => {
      let run = 0;
      return arr.map((v) => (run += v));
    };
    const shaped = prefs.cumulative ? perSeries.map(cum) : perSeries;

    // Previous period, shifted onto this period's buckets.
    let prev: number[] | null = null;
    const pp = previousPeriod(period);
    if (prefs.prev && pp) {
      prev = new Array<number>(n).fill(0);
      const shift = period.start.getTime() - pp.start.getTime();
      for (const e of allExpenses) {
        const t = new Date(e.date).getTime();
        if (t < pp.start.getTime() || t > pp.end.getTime() || !inShow(e.category)) continue;
        const i = indexOfTime.get(keyOf(new Date(t + shift)).getTime());
        if (i !== undefined) prev[i] += e.amount;
      }
      if (prefs.cumulative) prev = cum(prev);
    }

    // Budget pace: the monthly limit spread over each bucket's days.
    let budget: number[] | null = null;
    const monthly = monthlyBudgetFor(show, budgets);
    if (prefs.budget && monthly > 0) {
      budget = buckets.map((b) => {
        const days = gran === 'day' ? 1 : gran === 'week' ? 7 : getDaysInMonth(b);
        const perDay = monthly / (gran === 'month' ? getDaysInMonth(b) : 30.4375);
        return perDay * days;
      });
      if (prefs.cumulative) budget = cum(budget);
    }

    // Moving average of the total (not meaningful on a running total).
    let avg: number[] | null = null;
    if (prefs.avg && !prefs.cumulative) {
      const totals = buckets.map((_, i) => perSeries.reduce((s, arr) => s + arr[i], 0));
      const w = gran === 'day' ? 7 : gran === 'week' ? 4 : 3;
      avg = totals.map((_, i) => {
        const from = Math.max(0, i - w + 1);
        const slice = totals.slice(from, i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
      });
    }

    const rows = buckets.map((date, i) => ({
      date,
      values: shaped.map((arr) => arr[i]),
      total: shaped.reduce((s, arr) => s + arr[i], 0),
    }));
    return { rows, prevValues: prev, budgetValues: budget, avgValues: avg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, series, expenses, allExpenses, prefs.cumulative, prefs.prev, prefs.budget, prefs.avg, budgets, show, period]);

  // ---- geometry ------------------------------------------------------------------
  const n = rows.length;
  const [z0, z1] = zoom ?? [0, Math.max(0, n - 1)];
  const visible = rows.slice(z0, z1 + 1);
  const margin = { top: 14, right: 12, bottom: 28, left: 52 };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const count = Math.max(1, z1 - z0 + 1);
  const step = innerW / count;
  const xAt = (i: number) => (i - z0) * step + step / 2;
  const maxY =
    d3.max([
      d3.max(visible, (r) => r.total) ?? 0,
      d3.max(prevValues?.slice(z0, z1 + 1) ?? [0]) ?? 0,
      d3.max(budgetValues?.slice(z0, z1 + 1) ?? [0]) ?? 0,
      d3.max(avgValues?.slice(z0, z1 + 1) ?? [0]) ?? 0,
    ]) ?? 0;
  const y = d3.scaleLinear().domain([0, maxY > 0 ? maxY * 1.12 : 1]).range([innerH, 0]).nice(4);
  const yTicks = y.ticks(4);
  const colors = themeColors();

  const stackLayers = useMemo(() => {
    const keys = series.map((_, i) => String(i));
    const data = visible.map((r) => Object.fromEntries(r.values.map((v, i) => [String(i), v])) as Record<string, number>);
    return d3.stack<Record<string, number>>().keys(keys)(data);
  }, [visible, series]);

  const curve = d3.curveMonotoneX;
  const lineFor = (vals: number[]) =>
    d3
      .line<number>()
      .x((_, k) => xAt(z0 + k))
      .y((v) => y(v))
      .curve(curve)(vals) ?? '';

  // ---- pointer: hover + drag-to-zoom ------------------------------------------------
  const indexFromEvent = (ev: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const localX = ((ev.clientX - rect.left) * width) / rect.width - margin.left;
    return Math.max(z0, Math.min(z1, z0 + Math.floor(localX / step)));
  };
  const onDown = (ev: React.PointerEvent<SVGRectElement>) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const i = indexFromEvent(ev);
    setDrag({ from: i, to: i });
  };
  const onMove = (ev: React.PointerEvent<SVGRectElement>) => {
    const i = indexFromEvent(ev);
    setHover(i);
    if (drag) setDrag({ ...drag, to: i });
  };
  const onUp = () => {
    if (drag && Math.abs(drag.to - drag.from) >= 1) {
      setZoom([Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)]);
    }
    setDrag(null);
  };

  const viewTotal = prefs.cumulative
    ? (visible[visible.length - 1]?.total ?? 0) - (z0 > 0 ? rows[z0 - 1].total : 0)
    : visible.reduce((s, r) => s + r.total, 0);
  const peak = visible.reduce<{ r: (typeof rows)[number] | null }>((m, r) => (!m.r || r.total > m.r.total ? { r } : m), { r: null }).r;
  const pp = previousPeriod(period);

  // ---- PNG export ------------------------------------------------------------------
  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.querySelectorAll('[data-export-hide]').forEach((el) => el.remove());
    const svgText = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const scale = 2;
    const header = 56;
    const legendH = 28;
    const canvas = document.createElement('canvas');
    canvas.width = (width + 32) * scale;
    canvas.height = (height + header + legendH + 24) * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, width + 32, height + header + legendH + 24);
    ctx.fillStyle = colors.ink;
    ctx.font = '600 16px Georgia, serif';
    ctx.fillText(`Spending trend · ${period.label}`, 16, 26);
    ctx.fillStyle = colors.slate;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(`${describe()} · ${formatMoney(viewTotal, currency)} in view · ExpenseTrack Pro`, 16, 44);
    ctx.drawImage(img, 16, header, width, height);
    let lx = 16;
    ctx.font = '11px system-ui, sans-serif';
    for (const item of legendItems()) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, header + height + 12, 10, 10);
      ctx.fillStyle = colors.ink;
      ctx.fillText(item.label, lx + 14, header + height + 21);
      lx += ctx.measureText(item.label).width + 30;
    }
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = `spending-trend-${format(period.start, 'yyyy-MM-dd')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const describe = () => {
    const what = show === 'all' ? 'All spend' : showGroup ? showGroup.name : CATEGORY_LABELS[show as keyof typeof CATEGORY_LABELS];
    const g = gran === 'day' ? 'daily' : gran === 'week' ? 'weekly' : 'monthly';
    return `${what}, ${prefs.cumulative ? 'running total' : g}${stacked ? ', stacked' : ''}`;
  };

  const legendItems = () => {
    const items = series.length > 1 ? series.map((s) => ({ label: s.label, color: s.color })) : [];
    if (prevValues && pp) items.push({ label: `Previous (${pp.label})`, color: colors.slate });
    if (avgValues) items.push({ label: 'Moving average', color: colors.ink });
    if (budgetValues) items.push({ label: 'Budget pace', color: colors.ember });
    return items;
  };

  // ---- render ------------------------------------------------------------------------
  const barW = Math.max(1, Math.min(step * 0.72, 42));
  const hoverRow = hover !== null && hover >= z0 && hover <= z1 ? rows[hover] : null;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2" data-snapshot-exclude>
        <Segmented
          label="Chart style"
          value={prefs.style}
          onChange={(v) => set('style', v)}
          options={[
            { value: 'line', label: 'Line' },
            { value: 'area', label: 'Area' },
            { value: 'bar', label: 'Bars' },
          ]}
        />
        <Segmented
          label="Granularity"
          value={prefs.gran}
          onChange={(v) => set('gran', v)}
          options={[
            { value: 'auto', label: `Auto (${autoGran})` },
            { value: 'day', label: 'Day', disabled: !dayAllowed },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <select
          value={show}
          onChange={(e) => set('show', e.target.value)}
          aria-label="Show spending for"
          className="h-8 max-w-[13rem] px-2 rounded-lg border border-line bg-surface text-xs text-ink focus:outline-none focus:border-pine"
        >
          <option value="all">All spending</option>
          <optgroup label="Groups">
            {CATEGORY_GROUPS.map((g) => (
              <option key={g.id} value={groupBudgetKey(g.id)}>
                {g.icon} {g.name}
              </option>
            ))}
          </optgroup>
          {CATEGORY_GROUPS.map((g) => (
            <optgroup key={`c-${g.id}`} label={`${g.name} — categories`}>
              {g.categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          <Toggle on={stacked} disabled={!canStack} onClick={() => set('stack', !prefs.stack)} title={canStack ? 'Split into the biggest groups/categories' : 'Pick all spending or a group to stack'}>
            Stack
          </Toggle>
          <Toggle on={prefs.prev && !!pp} disabled={!pp} onClick={() => set('prev', !prefs.prev)} title={pp ? `Overlay ${pp.label}` : 'No earlier period to compare for this range'}>
            vs previous
          </Toggle>
          <Toggle on={prefs.avg && !prefs.cumulative} disabled={prefs.cumulative} onClick={() => set('avg', !prefs.avg)} title="Moving average of the total">
            Avg
          </Toggle>
          <Toggle on={prefs.cumulative} onClick={() => set('cumulative', !prefs.cumulative)} title="Running total across the period">
            Cumulative
          </Toggle>
          <Toggle
            on={prefs.budget && !!budgetValues}
            disabled={monthlyBudgetFor(show, budgets) <= 0}
            onClick={() => set('budget', !prefs.budget)}
            title={monthlyBudgetFor(show, budgets) > 0 ? 'Budget pace for what’s shown' : 'No budget covers what’s shown'}
          >
            Budget
          </Toggle>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {zoom && (
            <button type="button" onClick={() => setZoom(null)} className="h-8 px-2.5 rounded-lg border border-pine text-xs font-medium text-pine-strong dark:text-pine hover:bg-pine/10">
              Reset zoom
            </button>
          )}
          <button
            type="button"
            onClick={exportPng}
            className="h-8 px-2.5 rounded-lg border border-line text-xs font-medium text-ink hover:border-pine hover:text-pine-strong inline-flex items-center gap-1.5"
            title="Save this chart as a PNG image"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PNG
          </button>
        </div>
      </div>

      {/* Plot */}
      <div ref={wrapRef} className="relative select-none">
        {n === 0 || maxY === 0 ? (
          <div className="flex items-center justify-center text-sm text-slate rounded-lg border border-dashed border-line" style={{ height }}>
            Nothing to plot for {show === 'all' ? 'this period' : describe().split(',')[0]}.
          </div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`Spending trend: ${describe()}, ${period.label}`} style={{ display: 'block' }}>
            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Grid + y axis */}
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke={colors.line} strokeDasharray={t === 0 ? undefined : '2 4'} />
                  <text x={-8} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={10} fill={colors.slate} fontFamily="ui-monospace, Menlo, monospace">
                    {compactMoney(t, currency)}
                  </text>
                </g>
              ))}

              {/* Previous period (behind) */}
              {prevValues && (
                <path d={lineFor(prevValues.slice(z0, z1 + 1))} fill="none" stroke={colors.slate} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.75} />
              )}

              {/* Main series */}
              {prefs.style === 'bar'
                ? stackLayers.map((layer, li) => (
                    <g key={series[li].key} fill={series[li].color}>
                      {layer.map((seg, k) => {
                        const h = y(seg[0]) - y(seg[1]);
                        if (h <= 0) return null;
                        return <rect key={k} x={xAt(z0 + k) - barW / 2} y={y(seg[1])} width={barW} height={h} rx={series.length === 1 ? Math.min(3, barW / 3) : 0} />;
                      })}
                    </g>
                  ))
                : stackLayers.map((layer, li) => {
                    const top = d3
                      .line<[number, number]>()
                      .x((_, k) => xAt(z0 + k))
                      .y((d) => y(d[1]))
                      .curve(curve)(layer as unknown as [number, number][]) ?? '';
                    const area = d3
                      .area<[number, number]>()
                      .x((_, k) => xAt(z0 + k))
                      .y0((d) => y(d[0]))
                      .y1((d) => y(d[1]))
                      .curve(curve)(layer as unknown as [number, number][]) ?? '';
                    const filled = prefs.style === 'area' || series.length > 1;
                    return (
                      <g key={series[li].key}>
                        {filled && <path d={area} fill={series[li].color} opacity={series.length > 1 ? 0.78 : 0.16} />}
                        <path d={top} fill="none" stroke={series[li].color} strokeWidth={series.length > 1 ? 1.2 : 2.4} strokeLinejoin="round" strokeLinecap="round" />
                      </g>
                    );
                  })}

              {/* Overlays */}
              {avgValues && <path d={lineFor(avgValues.slice(z0, z1 + 1))} fill="none" stroke={colors.ink} strokeWidth={1.6} opacity={0.7} />}
              {budgetValues && (
                <path d={lineFor(budgetValues.slice(z0, z1 + 1))} fill="none" stroke={colors.ember} strokeWidth={2} strokeDasharray="7 4" />
              )}

              {/* X axis labels */}
              {(() => {
                const slots = Math.max(2, Math.min(7, Math.floor(innerW / 95), count));
                const idxs = Array.from(new Set(Array.from({ length: slots }, (_, k) => z0 + Math.round((k * (count - 1)) / Math.max(1, slots - 1)))));
                return idxs.map((i, k) => (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={innerH + 18}
                    textAnchor={k === 0 && idxs.length > 1 ? 'start' : k === idxs.length - 1 && idxs.length > 1 ? 'end' : 'middle'}
                    fontSize={10}
                    fill={colors.slate}
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {format(rows[i].date, AXIS_FORMAT[gran])}
                  </text>
                ));
              })()}

              {/* Hover crosshair */}
              {hoverRow && !drag && (
                <g data-export-hide pointerEvents="none">
                  <line x1={xAt(hover!)} x2={xAt(hover!)} y1={0} y2={innerH} stroke={colors.ink} strokeOpacity={0.25} strokeDasharray="3 3" />
                  <circle cx={xAt(hover!)} cy={y(hoverRow.total)} r={4.5} fill={colors.surface} stroke={series.length === 1 ? series[0].color : colors.ink} strokeWidth={2} />
                </g>
              )}

              {/* Drag selection */}
              {drag && drag.from !== drag.to && (
                <rect
                  data-export-hide
                  x={xAt(Math.min(drag.from, drag.to)) - step / 2}
                  y={0}
                  width={(Math.abs(drag.to - drag.from) + 1) * step}
                  height={innerH}
                  fill={colors.pine}
                  opacity={0.12}
                  stroke={colors.pine}
                  strokeOpacity={0.4}
                />
              )}

              <rect
                data-export-hide
                x={0}
                y={0}
                width={innerW}
                height={innerH}
                fill="transparent"
                style={{ cursor: drag ? 'col-resize' : 'crosshair', touchAction: 'pan-y' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={() => {
                  setHover(null);
                  if (drag) onUp();
                }}
              />
            </g>
          </svg>
        )}

        {/* Tooltip */}
        <AnimatePresence>
          {hoverRow && !drag && (
            <motion.div
              key="tip"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute z-10 top-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-ledger-lg font-mono tabular min-w-[11rem]"
              style={{
                left: `${((margin.left + xAt(hover!)) / width) * 100}%`,
                transform: `translateX(${xAt(hover!) > innerW * 0.6 ? 'calc(-100% - 10px)' : '10px'})`,
              }}
            >
              <p className="text-slate mb-1">{format(hoverRow.date, HOVER_FORMAT[gran])}</p>
              <TipRow color={series.length === 1 ? series[0].color : undefined} label={prefs.cumulative ? 'Running total' : 'Spent'} value={formatMoney(hoverRow.total, currency)} strong />
              {series.length > 1 &&
                series
                  .map((s, i) => ({ s, v: hoverRow.values[i] }))
                  .filter((x) => x.v > 0)
                  .sort((a, b) => b.v - a.v)
                  .map(({ s, v }) => <TipRow key={s.key} color={s.color} label={s.label} value={formatMoney(v, currency)} />)}
              {prevValues && <TipRow color={colors.slate} dashed label="Previous" value={formatMoney(prevValues[hover!], currency)} />}
              {avgValues && <TipRow color={colors.ink} label="Average" value={formatMoney(Math.round(avgValues[hover!]), currency)} />}
              {budgetValues && (
                <TipRow
                  color={colors.ember}
                  dashed
                  label="Budget"
                  value={`${formatMoney(Math.round(budgetValues[hover!]), currency)}${
                    budgetValues[hover!] > 0 ? ` · ${Math.round((hoverRow.total / budgetValues[hover!]) * 100)}%` : ''
                  }`}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend + facts */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legendItems().map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-ink/85">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </span>
          ))}
          <span className="text-slate font-mono" data-snapshot-exclude>
            {zoom ? 'Zoomed — ' : ''}drag across the chart to zoom
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular text-slate">
          <span>
            In view <b className="text-ink font-semibold">{formatMoney(viewTotal, currency)}</b>
          </span>
          {!prefs.cumulative && peak && peak.total > 0 && (
            <span>
              Peak <b className="text-ink font-semibold">{formatMoney(peak.total, currency)}</b> · {format(peak.date, AXIS_FORMAT[gran])}
            </span>
          )}
          {!prefs.cumulative && visible.length > 0 && (
            <span>
              Avg / {gran} <b className="text-ink font-semibold">{formatMoney(Math.round(viewTotal / visible.length), currency)}</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg border border-line bg-paper" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-slate hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`h-8 px-2.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        on ? 'bg-pine text-paper border-pine' : 'bg-surface text-ink border-line hover:border-pine'
      }`}
    >
      {children}
    </button>
  );
}

function TipRow({ color, label, value, strong, dashed }: { color?: string; label: string; value: string; strong?: boolean; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-slate min-w-0">
        {color && (
          <span
            className="w-2.5 shrink-0"
            style={dashed ? { borderTop: `2px dashed ${color}`, height: 0 } : { background: color, height: 10, borderRadius: 2 }}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className={strong ? 'text-ink font-semibold' : 'text-ink'}>{value}</span>
    </div>
  );
}
