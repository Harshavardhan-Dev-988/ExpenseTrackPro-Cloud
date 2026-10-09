/**
 * The landing page's product preview: a small, live-feeling slice of the
 * dashboard floating on the dark hero — the month's total counting up, the
 * ledger line inking itself in, where the money went, a WhatsApp entry
 * arriving and a budget ring filling. Purely illustrative (fixed sample
 * numbers, aria-hidden), and it leans slightly toward the pointer.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, animate } from 'framer-motion';

const LINE =
  'M0,92 C22,88 34,58 58,62 C82,66 92,30 118,34 C144,38 150,74 176,70 C202,66 210,44 236,40 C262,36 272,60 298,52 C318,46 330,22 352,18';

const BARS = [
  { label: 'Home & bills', pct: 61, color: '#C9845F' },
  { label: 'Groceries', pct: 18, color: '#7AA891' },
  { label: 'Fuel & travel', pct: 12, color: '#7E9CB0' },
  { label: 'Dining out', pct: 9, color: '#D6A55C' },
];

function useCountUp(to: number, delay: number, reduce: boolean) {
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, to, {
      duration: 1.6,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [to, delay, reduce]);
  return value;
}

export default function HeroPreview() {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 120, damping: 18 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 120, damping: 18 });
  const total = useCountUp(58517, 0.5, reduce);

  const onMove = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const float = (amp: number, duration: number, delay = 0) =>
    reduce ? {} : { animate: { y: [0, -amp, 0] }, transition: { duration, delay, repeat: Infinity, ease: 'easeInOut' as const } };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="relative w-full max-w-[560px] mx-auto aspect-[0.8] sm:aspect-[1.12] select-none"
      style={{ perspective: 1200 }}
      aria-hidden="true"
    >
      <motion.div className="absolute inset-0" style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
        {/* Main dashboard card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 sm:left-[4%] top-[25%] sm:top-[8%] w-[94%] sm:w-[80%] rounded-2xl border border-white/10 bg-[#16241D]/85 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] p-5 sm:p-6"
          style={{ z: 40 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#9EAB9E]">Spent · October</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7AA891]/15 px-2 py-0.5 text-[10px] font-mono text-[#96C4AC]">
              ▼ 12.6% vs Sep
            </span>
          </div>
          <p className="mt-2 font-display text-[34px] sm:text-[40px] leading-none font-semibold text-[#EEF1EE] tabular-nums">
            ₹{Math.round(total).toLocaleString('en-IN')}
          </p>

          <svg viewBox="0 0 352 100" className="mt-4 w-full h-[92px] overflow-visible">
            <defs>
              <linearGradient id="hp-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7AA891" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#7AA891" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[20, 45, 70, 95].map((y) => (
              <line key={y} x1="0" x2="352" y1={y} y2={y} stroke="#EEF1EE" strokeOpacity="0.06" />
            ))}
            <motion.path
              d={`${LINE} L352,100 L0,100 Z`}
              fill="url(#hp-fill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.8 }}
            />
            <motion.path
              d={LINE}
              fill="none"
              stroke="#96C4AC"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, delay: 0.6, ease: [0.65, 0, 0.35, 1] }}
            />
            <motion.circle
              cx="352"
              cy="18"
              r="4.5"
              fill="#96C4AC"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2.3, type: 'spring', stiffness: 400, damping: 14 }}
            />
          </svg>

          <div className="mt-4 space-y-2.5">
            {BARS.map((b, i) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-24 text-[11px] text-[#C9D3C9] truncate">{b.label}</span>
                <span className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: b.color }}
                    initial={{ width: reduce ? `${b.pct}%` : 0 }}
                    animate={{ width: `${b.pct}%` }}
                    transition={{ duration: 1.1, delay: 1.1 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
                <span className="w-8 text-right text-[11px] font-mono text-[#9EAB9E]">{b.pct}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* WhatsApp entry arriving */}
        <motion.div
          initial={{ opacity: 0, x: 30, y: 10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.7, delay: 1.9, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-0 top-0 w-[64%] sm:w-[46%] sm:min-w-[190px]"
          style={{ z: 90 }}
        >
          <motion.div {...float(6, 5.5)} className="rounded-2xl border border-white/10 bg-[#EEF1EE] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.65)] p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
                  <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.8.9c.3.1.4.2.5.3.1.2.1.7-.1 1.3z" />
                </svg>
              </span>
              <span className="text-[11px] font-semibold text-[#17211D]">WhatsApp</span>
              <span className="ml-auto text-[10px] text-[#5C6B64]">now</span>
            </div>
            <div className="ml-auto w-fit rounded-xl rounded-tr-sm bg-[#D9FDD3] px-3 py-1.5 text-[13px] text-[#17211D] font-mono">
              450 dinner zomato
            </div>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.6, duration: 0.5 }}
              className="mt-2 w-fit rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-[12px] text-[#17211D] shadow-sm"
            >
              <span className="text-[#2F4D3F] font-semibold">✓ Recorded</span> · ₹450 · Zomato
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Budget ring */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 2.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-[2%] bottom-[3%] w-[40%] min-w-[170px] hidden sm:block"
          style={{ z: 70 }}
        >
          <motion.div
            {...float(5, 6.5, 0.8)}
            className="rounded-2xl border border-white/10 bg-[#1B2620]/90 backdrop-blur-xl shadow-[0_24px_60px_-18px_rgba(0,0,0,0.65)] p-4 flex items-center gap-3"
          >
            <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90 shrink-0">
              <circle cx="22" cy="22" r="18" fill="none" stroke="#EEF1EE" strokeOpacity="0.1" strokeWidth="5" />
              <motion.circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="#D6A55C"
                strokeWidth="5"
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 0.63 }}
                transition={{ delay: 2.6, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#9EAB9E]">Groceries</p>
              <p className="text-sm font-semibold text-[#EEF1EE]">63% of budget</p>
              <p className="text-[11px] text-[#9EAB9E]">₹8,190 of ₹13,000</p>
            </div>
          </motion.div>
        </motion.div>

        {/* Small stamp */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={{ delay: 2.9, type: 'spring', stiffness: 260, damping: 16 }}
          className="absolute left-0 bottom-[12%] hidden sm:block rounded-xl border border-[#D6A55C]/40 bg-[#D6A55C]/10 backdrop-blur px-3 py-2"
          style={{ z: 60 }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#E8BD7A]">Saved this month</p>
          <p className="font-display text-lg font-semibold text-[#EEF1EE]">₹8,433</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
