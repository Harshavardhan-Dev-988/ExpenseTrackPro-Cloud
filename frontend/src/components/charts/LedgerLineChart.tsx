import { useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { formatMoney } from '../../utils/helpers';

export interface LedgerPoint {
  date: Date;
  value: number;
}

interface LedgerLineChartProps {
  data: LedgerPoint[];
  currency?: string;
  /** Compact mode: no axis labels, no hover — used as a sparkline inline with a headline number. */
  compact?: boolean;
  height?: number;
  accent?: 'pine' | 'brass';
  ariaLabel: string;
  /** Optional caption rendered under the figure. */
  caption?: string;
}

/**
 * The app's signature visual: spending drawn as a single hand-inked line on
 * a faint ruled-paper ground, writing itself in on mount. Every trend view
 * in the app (dashboard sparkline, monthly/daily trend, goal progress)
 * shares this component so the metaphor — "your finances are a line you're
 * writing, not a stat you're graded on" — stays consistent everywhere.
 *
 * The hand-drawn quality comes from an SVG feTurbulence/feDisplacementMap
 * filter on the stroke only — a texture, not a distortion of the actual
 * data points, which stay exactly where the numbers say they should.
 */
export default function LedgerLineChart({
  data,
  currency = 'INR',
  compact = false,
  height = compact ? 64 : 260,
  accent = 'pine',
  ariaLabel,
  caption,
}: LedgerLineChartProps) {
  const filterId = useId();
  const clipId = useId();
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const width = 640; // viewBox width; scales responsively via CSS
  const margin = compact
    ? { top: 6, right: 4, bottom: 6, left: 4 }
    : { top: 16, right: 16, bottom: 28, left: 8 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const strokeColor = accent === 'brass' ? 'rgb(var(--brass))' : 'rgb(var(--pine))';
  const fillColorId = `url(#${gradientId})`;

  const { xScale, linePath, areaPath, points } = useMemo(() => {
    if (data.length === 0) {
      return { xScale: null, yScale: null, linePath: '', areaPath: '', points: [] as { x: number; y: number; d: LedgerPoint }[] };
    }
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerW]);

    const maxValue = d3.max(data, (d) => d.value) ?? 0;
    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue > 0 ? maxValue * 1.15 : 1])
      .range([innerH, 0]);

    const lineGen = d3
      .line<LedgerPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveCatmullRom.alpha(0.75));

    const areaGen = d3
      .area<LedgerPoint>()
      .x((d) => xScale(d.date))
      .y0(innerH)
      .y1((d) => yScale(d.value))
      .curve(d3.curveCatmullRom.alpha(0.75));

    const points = data.map((d) => ({ x: xScale(d.date), y: yScale(d.value), d }));

    return {
      xScale,
      yScale,
      linePath: lineGen(data) || '',
      areaPath: areaGen(data) || '',
      points,
    };
  }, [data, innerW, innerH]);

  const handlePointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (!xScale || points.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const localX = (event.clientX - rect.left) * scaleX - margin.left;
    const bisect = d3.bisector<{ x: number }, number>((p) => p.x).left;
    let idx = bisect(points, localX);
    idx = Math.max(0, Math.min(points.length - 1, idx));
    const p = points[idx];
    setHover({ index: idx, x: p.x, y: p.y });
  };

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-slate font-body"
        style={{ height }}
      >
        Not enough entries yet to draw a line.
      </div>
    );
  }

  const lastPoint = points[points.length - 1];
  const hoveredPoint = hover ? points[hover.index] : null;

  return (
    <figure className="w-full">
      <div className={compact ? '' : 'ledger-rules rounded-lg'} style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={ariaLabel}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Hand-inked texture: displaces the stroke by a tiny, fixed amount of
                noise. Data coordinates underneath are untouched. */}
            <filter id={filterId} x="-5%" y="-40%" width="110%" height="180%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.35" numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={compact ? 1.1 : 1.8} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={innerW} height={innerH + 8} />
            </clipPath>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.16} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <g transform={`translate(${margin.left},${margin.top})`}>
            <g clipPath={`url(#${clipId})`}>
              {!compact && (
                <motion.path
                  d={areaPath}
                  fill={fillColorId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.3 }}
                />
              )}
              <motion.path
                d={linePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth={compact ? 2 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${filterId})`}
                initial={prefersReducedMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>

            {/* Endpoint — the "ink is still wet" marker */}
            <motion.circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={compact ? 2.5 : 4}
              fill={strokeColor}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 1.0, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
            {!compact && !prefersReducedMotion && (
              <circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill="none" stroke={strokeColor} strokeWidth={1.5} className="animate-ring-pulse" style={{ animationDuration: '2.2s', animationIterationCount: 'infinite' }} />
            )}

            {/* Hover guide */}
            <AnimatePresence>
              {!compact && hoveredPoint && (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <line
                    x1={hoveredPoint.x}
                    x2={hoveredPoint.x}
                    y1={0}
                    y2={innerH}
                    stroke="rgb(var(--ink))"
                    strokeOpacity={0.18}
                    strokeDasharray="3 3"
                  />
                  <motion.circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r={5}
                    fill="rgb(var(--surface))"
                    stroke={strokeColor}
                    strokeWidth={2}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 22 }}
                  />
                </motion.g>
              )}
            </AnimatePresence>

            {!compact && (
              <rect
                x={0}
                y={-margin.top}
                width={innerW}
                height={height}
                fill="transparent"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHover(null)}
                style={{ cursor: 'crosshair' }}
              />
            )}

            {!compact && xScale && (
              <g className="font-mono" fontSize={10} fill="rgb(var(--slate))">
                <text x={0} y={innerH + 20} textAnchor="start">
                  {format(data[0].date, 'MMM d')}
                </text>
                <text x={innerW} y={innerH + 20} textAnchor="end">
                  {format(data[data.length - 1].date, 'MMM d')}
                </text>
              </g>
            )}
          </g>
        </svg>

        <AnimatePresence>
          {!compact && hoveredPoint && (
            <motion.div
              key={hover!.index}
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
              className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-ledger-lg font-mono tabular"
              style={{
                left: `${((hoveredPoint.x + margin.left) / width) * 100}%`,
                top: 4,
                transform: `translateX(${hoveredPoint.x > innerW * 0.7 ? '-100%' : '0'})`,
              }}
            >
              <div className="text-slate">{format(points[hover!.index].d.date, 'EEE, MMM d')}</div>
              <div className="font-semibold text-ink">{formatMoney(points[hover!.index].d.value, currency)}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-slate font-body">{caption}</figcaption>
      )}
    </figure>
  );
}
