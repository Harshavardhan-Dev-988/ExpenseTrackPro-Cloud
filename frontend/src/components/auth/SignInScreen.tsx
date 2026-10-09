/**
 * The landing page — what anyone who isn't signed in sees.
 *
 * A dark "ledger at night" hero (ruled lines, a pine and a brass glow) with
 * the headline, a live-feeling product preview and the sign-in card, then a
 * short tour of what the app does and a closing call to action. Built only
 * from the app's own palette and type (Fraunces / Karla / JetBrains Mono)
 * so it reads as the same product as the dashboard behind it.
 *
 * Sign-in happens in-app (AuthCard) rather than on Cognito's hosted page.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import AuthCard from './AuthCard';
import HeroPreview from './HeroPreview';

const ease = [0.16, 1, 0.3, 1] as const;

const FEATURES: { title: string; body: string; icon: ReactNode; art: ReactNode }[] = [
  {
    title: 'Log it from WhatsApp',
    body: 'Text “450 dinner zomato” and it’s in your ledger, categorised, in seconds — no app to open.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4.3-1L3 20l1.4-3.7A7.6 7.6 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" />,
    art: (
      <div className="space-y-2">
        <div className="ml-auto w-fit rounded-xl rounded-tr-sm bg-[#D9FDD3] px-3 py-1.5 text-[13px] font-mono text-[#17211D]">150 auto</div>
        <div className="w-fit rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-[12px] text-[#17211D] shadow-sm">
          <b className="text-[#2F4D3F]">✓ Recorded</b> · ₹150 · Auto/Rickshaw
        </div>
      </div>
    ),
  },
  {
    title: 'See where the month went',
    body: '80+ categories built for Indian homes — from milk and maid to school fees and Diwali gifts.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M11 3.1A9 9 0 1020.9 13H11V3.1zM20.5 9H15V3.5A9 9 0 0120.5 9z" />,
    art: (
      <div className="space-y-2">
        {(
          [
            ['Home & bills', 61, '#C9845F'],
            ['Groceries', 24, '#6B8F71'],
            ['Dining out', 15, '#A9762E'],
          ] as const
        ).map(([l, p, c]) => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-20 text-[11px] text-[#5C6B64]">{l}</span>
            <span className="flex-1 h-1.5 rounded-full bg-[#E3E8E2]">
              <span className="block h-full rounded-full" style={{ width: `${p}%`, background: c }} />
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Budgets that nudge, not nag',
    body: 'Set monthly or yearly limits per category; get a quiet heads-up before you cross them.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12l2 2 4-4m5.6-4A12 12 0 0112 3 12 12 0 013.4 6 12 12 0 003 9c0 5.6 3.8 10.3 9 11.6 5.2-1.3 9-6 9-11.6 0-1-.1-2-.4-3z" />,
    art: (
      <div className="flex gap-2 flex-wrap">
        <span className="rounded-full bg-[#B3492F]/10 text-[#97381F] text-[11px] font-medium px-2.5 py-1">Dining out 112%</span>
        <span className="rounded-full bg-[#A9762E]/10 text-[#8A5C14] text-[11px] font-medium px-2.5 py-1">Fuel 86%</span>
        <span className="rounded-full bg-[#2F4D3F]/10 text-[#243C31] text-[11px] font-medium px-2.5 py-1">Groceries 63%</span>
      </div>
    ),
  },
  {
    title: 'Your data, always yours',
    body: 'Export to PDF, Excel or CSV in a tap, and back up everything to a single file whenever you like.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
    art: (
      <div className="flex gap-2">
        {['PDF', 'XLSX', 'CSV', 'JSON'].map((f) => (
          <span key={f} className="rounded-lg border border-[#D9DDD6] bg-white px-2.5 py-1.5 text-[11px] font-mono font-semibold text-[#3D4A44]">
            {f}
          </span>
        ))}
      </div>
    ),
  },
];

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7AA891] to-[#2F4D3F] flex items-center justify-center shadow-[0_6px_20px_-6px_rgba(122,168,145,0.6)]">
        <span className="font-display text-[17px] font-semibold text-white">₹</span>
      </span>
      <span className="font-display text-[19px] font-semibold tracking-tight text-[#EEF1EE]">
        ExpenseTrack <span className="text-[#96C4AC]">Pro</span>
      </span>
    </span>
  );
}

export default function SignInScreen({ authError }: { authError?: string | null }) {
  const reduce = !!useReducedMotion();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [modeNonce, setModeNonce] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const openAuth = (m: 'signIn' | 'signUp') => {
    setMode(m);
    setModeNonce((n) => n + 1);
    cardRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setTimeout(
      () => cardRef.current?.querySelector<HTMLInputElement>('input[type="email"], input[type="text"]')?.focus({ preventScroll: true }),
      500
    );
  };

  return (
    <div className="min-h-screen bg-[#0B1310] text-[#EEF1EE] font-body antialiased overflow-x-hidden">
      {/* ============================ HERO ============================ */}
      <section className="relative isolate">
        {/* Backdrop: glows, ruled ledger lines, a margin rule, grain */}
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-40 -left-40 w-[720px] h-[720px] rounded-full bg-[#2F4D3F] opacity-50 blur-[140px]" />
          <div className="absolute top-1/3 -right-48 w-[620px] h-[620px] rounded-full bg-[#A9762E] opacity-[0.22] blur-[150px]" />
          <div className="absolute bottom-0 left-1/3 w-[520px] h-[320px] rounded-full bg-[#7AA891] opacity-[0.12] blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'repeating-linear-gradient(to bottom, #EEF1EE 0, #EEF1EE 1px, transparent 1px, transparent 34px)',
              maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 85%)',
            }}
          />
          <div
            className="absolute inset-y-0 left-[6%] w-px bg-[#B3492F] opacity-[0.22] hidden lg:block"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
            }}
          />
          <svg className="absolute inset-0 w-full h-full opacity-[0.08] mix-blend-overlay">
            <filter id="landing-grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#landing-grain)" />
          </svg>
        </div>

        {/* Top bar */}
        <header className="max-w-7xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <Brand />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden sm:inline-flex px-3 py-2 text-sm text-[#B9C4BA] hover:text-white transition-colors">
              Features
            </a>
            <button
              type="button"
              onClick={() => openAuth('signIn')}
              className="px-3.5 py-2 text-sm font-medium text-[#EEF1EE] hover:text-white transition-colors"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth('signUp')}
              className="hidden sm:inline-flex px-4 py-2 rounded-full text-sm font-semibold bg-[#EEF1EE] text-[#0B1310] hover:bg-white transition-colors"
            >
              Get started
            </button>
          </nav>
        </header>

        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-6 sm:pt-10 lg:pt-14 pb-16 lg:pb-24 grid lg:grid-cols-12 gap-12 lg:gap-10 items-start">
          {/* Copy + preview */}
          <div className="lg:col-span-7">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur px-3 py-1.5 text-[12px] text-[#C9D3C9]"
            >
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-[#7AA891] animate-ping opacity-60" />
                <span className="relative w-2 h-2 rounded-full bg-[#7AA891]" />
              </span>
              The household ledger, made for Indian families
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.08, ease }}
              className="mt-6 font-display font-semibold tracking-[-0.025em] leading-[0.98] text-[46px] sm:text-[64px] lg:text-[76px]"
            >
              Every rupee,
              <br />
              <span className="relative inline-block italic font-medium pb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#E8BD7A] via-[#D6A55C] to-[#96C4AC]">
                accounted for.
                <svg
                  className="absolute left-0 -bottom-1 sm:-bottom-2 w-full h-4 overflow-visible"
                  viewBox="0 0 300 16"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M3,11 C60,4 120,14 180,7 C220,3 260,9 297,6"
                    fill="none"
                    stroke="#D6A55C"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.1, delay: 0.7, ease: [0.65, 0, 0.35, 1] }}
                  />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease }}
              className="mt-7 max-w-xl text-[17px] sm:text-[19px] leading-relaxed text-[#B9C4BA]"
            >
              Track spending, budgets and savings in one calm, beautiful ledger. Log an expense from WhatsApp in five
              seconds — and always know exactly where the month went.
            </motion.p>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="mt-7 flex flex-wrap gap-x-6 gap-y-2.5 text-[14px] text-[#C9D3C9]"
            >
              {['Free to use', 'Syncs across your devices', 'Export anytime'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#7AA891]/15 text-[#96C4AC] flex items-center justify-center text-[11px]">✓</span>
                  {t}
                </li>
              ))}
            </motion.ul>

            <div className="mt-12 hidden lg:block">
              <HeroPreview />
            </div>
          </div>

          {/* Auth card */}
          <motion.div
            ref={cardRef}
            id="auth"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="lg:col-span-5 lg:sticky lg:top-10 flex justify-center lg:justify-end scroll-mt-24"
          >
            <div className="relative w-full max-w-[440px]">
              <div
                className="absolute -inset-6 rounded-[32px] bg-gradient-to-b from-[#7AA891]/25 via-transparent to-[#D6A55C]/20 blur-2xl -z-10"
                aria-hidden="true"
              />
              <AuthCard key={modeNonce} initialMode={mode} initialError={modeNonce === 0 ? authError : null} />
            </div>
          </motion.div>

          <div className="lg:hidden -mt-2">
            <HeroPreview />
          </div>
        </div>

        {/* Stat strip */}
        <div className="border-y border-white/[0.07] bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              ['80+', 'Indian expense categories'],
              ['5 sec', 'to log from WhatsApp'],
              ['₹ first', 'Lakh & crore formatting'],
              ['1 tap', 'PDF, Excel & CSV exports'],
            ].map(([k, v]) => (
              <div key={v}>
                <p className="font-display text-[28px] font-semibold text-[#EEF1EE] leading-none">{k}</p>
                <p className="mt-1.5 text-[13px] text-[#9EAB9E]">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================== FEATURES ========================== */}
      <section id="features" className="relative bg-[#EEF1EE] text-[#17211D] scroll-mt-4">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-[#2F4D3F]">Why it works</p>
            <h2 className="mt-3 font-display text-[36px] sm:text-[48px] leading-[1.05] font-semibold tracking-[-0.02em]">
              A ledger that keeps itself — <span className="italic font-medium text-[#2F4D3F]">almost.</span>
            </h2>
            <p className="mt-4 text-[17px] text-[#5C6B64] leading-relaxed">
              Built around how Indian households actually spend: UPI and cash side by side, monthly bills, school terms,
              festivals and the odd family wedding.
            </p>
          </div>

          <div className="mt-14 grid sm:grid-cols-2 gap-5">
            {FEATURES.map((f, i) => (
              <motion.article
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: (i % 2) * 0.08, ease }}
                className="group relative rounded-[22px] bg-white border border-[#DCE1DA] p-7 sm:p-8 shadow-[0_1px_2px_rgba(23,33,29,0.04),0_18px_40px_-24px_rgba(23,33,29,0.25)] hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(23,33,29,0.05),0_28px_60px_-28px_rgba(23,33,29,0.35)] transition-[transform,box-shadow] duration-300"
              >
                <span className="w-11 h-11 rounded-xl bg-[#2F4D3F]/[0.08] text-[#2F4D3F] flex items-center justify-center">
                  <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    {f.icon}
                  </svg>
                </span>
                <h3 className="mt-5 font-display text-[22px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[15px] text-[#5C6B64] leading-relaxed">{f.body}</p>
                <div className="mt-6 rounded-2xl bg-[#F4F6F3] border border-[#E4E8E2] p-4">{f.art}</div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ CTA ============================= */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[#2F4D3F] opacity-50 blur-[140px]" />
        </div>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
          <h2 className="font-display text-[34px] sm:text-[48px] leading-[1.05] font-semibold tracking-[-0.02em]">
            Start this month’s ledger tonight.
          </h2>
          <p className="mt-4 text-[17px] text-[#B9C4BA]">
            It takes a minute. Bring last month’s spreadsheet if you have one — it imports.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => openAuth('signUp')}
              className="h-12 px-7 rounded-full bg-[#EEF1EE] text-[#0B1310] text-[15px] font-semibold hover:bg-white transition-colors"
            >
              Create your free account
            </button>
            <button
              type="button"
              onClick={() => openAuth('signIn')}
              className="h-12 px-7 rounded-full border border-white/20 text-[15px] font-semibold text-[#EEF1EE] hover:bg-white/5 transition-colors"
            >
              I already have one
            </button>
          </div>
        </div>
        <footer className="border-t border-white/[0.07]">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[#8A978E]">
            <Brand />
            <p>© {new Date().getFullYear()} ExpenseTrack Pro · Your household ledger</p>
          </div>
        </footer>
      </section>
    </div>
  );
}
