/**
 * The app header.
 *
 * Desktop (md and up): logo, the section tabs, a primary "Add expense"
 * button and a ☰ menu button. Everything that isn't navigation or the one
 * primary action — import, backup, WhatsApp, exports, theme, sign out —
 * lives in the ☰ dropdown instead of seven buttons competing in a row.
 *
 * Phones: logo + current section, a compact add button and ☰, which opens
 * a slide-in drawer holding the sections *and* those same actions — so the
 * sticky header is one slim row instead of half the screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ExportFormat } from '../../hooks/useExportActions';
import { NAV_ITEMS, type View } from './nav';


interface AppHeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onAddExpense: () => void;
  onImport: () => void;
  onBackup: () => void;
  onWhatsApp: () => void;
  onExport: (format: ExportFormat) => void;
  onExportSummary: () => void;
  onPdfReport: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

// ---------------------------------------------------------------------------
// Icons (inline, 24px grid, stroke = currentColor)
// ---------------------------------------------------------------------------
const icon = (d: string | string[]) => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    {(Array.isArray(d) ? d : [d]).map((p) => (
      <path key={p} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={p} />
    ))}
  </svg>
);

const ICONS = {
  menu: icon('M4 6h16M4 12h16M4 18h16'),
  close: icon('M6 18L18 6M6 6l12 12'),
  plus: icon('M12 5v14m7-7H5'),
  import: icon('M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'),
  backup: icon('M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4'),
  whatsapp: icon('M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'),
  export: icon('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4'),
  pdf: icon(['M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z']),
  sheet: icon('M3 10h18M3 14h18M10 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z'),
  code: icon('M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'),
  summary: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'),
  moon: icon('M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'),
  sun: icon('M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.36-6.36l-1.06 1.06M6.7 17.3l-1.06 1.06m12.72 0l-1.06-1.06M6.7 6.7L5.64 5.64M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z'),
  signout: icon('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'),
  chevron: icon('M19 9l-7 7-7-7'),
  dashboard: icon('M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10-3a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z'),
  expenses: icon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6-4h6'),
  budgets: icon(['M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z', 'M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z']),
  savings: icon('M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
  analytics: icon('M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z'),
};

const VIEW_ICONS: Record<View, ReactNode> = {
  dashboard: ICONS.dashboard,
  expenses: ICONS.expenses,
  budgets: ICONS.budgets,
  savings: ICONS.savings,
  analytics: ICONS.analytics,
};

// ---------------------------------------------------------------------------
// Shared menu content (used by both the desktop dropdown and mobile drawer)
// ---------------------------------------------------------------------------
interface MenuContentProps extends Omit<AppHeaderProps, 'currentView' | 'onNavigate' | 'onAddExpense'> {
  close: () => void;
}

function MenuItem({
  children,
  iconNode,
  hint,
  onSelect,
  tone,
  trailing,
  ariaExpanded,
}: {
  children: ReactNode;
  iconNode: ReactNode;
  hint?: string;
  onSelect: () => void;
  tone?: 'danger';
  trailing?: ReactNode;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-expanded={ariaExpanded}
      onClick={onSelect}
      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors focus:outline-none focus-visible:bg-paper ${
        tone === 'danger'
          ? 'text-ember-strong dark:text-ember hover:bg-ember/8'
          : 'text-ink hover:bg-paper'
      }`}
    >
      <span className={tone === 'danger' ? '' : 'text-slate group-hover:text-pine-strong dark:group-hover:text-pine transition-colors'}>
        {iconNode}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium leading-tight">{children}</span>
        {hint && <span className="block text-xs text-slate mt-0.5 leading-tight">{hint}</span>}
      </span>
      {trailing}
    </button>
  );
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate">{children}</p>;
}

function MenuContent({
  close,
  onImport,
  onBackup,
  onWhatsApp,
  onExport,
  onExportSummary,
  onPdfReport,
  isDarkMode,
  onToggleTheme,
  onSignOut,
}: MenuContentProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <div className="py-1">
      <MenuSectionLabel>Your data</MenuSectionLabel>
      <MenuItem iconNode={ICONS.import} hint="CSV, Excel or JSON file" onSelect={run(onImport)}>
        Import expenses
      </MenuItem>
      <MenuItem iconNode={ICONS.backup} hint="Download or restore everything" onSelect={run(onBackup)}>
        Backup &amp; restore
      </MenuItem>
      <MenuItem
        iconNode={ICONS.export}
        hint="PDF report, Excel, CSV, JSON"
        onSelect={() => setExportOpen((o) => !o)}
        ariaExpanded={exportOpen}
        trailing={
          <span className={`text-slate transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`}>{ICONS.chevron}</span>
        }
      >
        Export
      </MenuItem>
      <AnimatePresence initial={false}>
        {exportOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-5 pl-2 border-l border-line">
              <MenuItem iconNode={ICONS.pdf} hint="Charts, categories, budgets" onSelect={run(onPdfReport)}>
                PDF report
              </MenuItem>
              <MenuItem iconNode={ICONS.sheet} onSelect={run(() => onExport('excel'))}>
                Excel (.xlsx)
              </MenuItem>
              <MenuItem iconNode={ICONS.sheet} onSelect={run(() => onExport('csv'))}>
                CSV
              </MenuItem>
              <MenuItem iconNode={ICONS.code} onSelect={run(() => onExport('json'))}>
                JSON
              </MenuItem>
              <MenuItem iconNode={ICONS.summary} hint="Totals per category" onSelect={run(onExportSummary)}>
                Category summary (CSV)
              </MenuItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MenuSectionLabel>Connect</MenuSectionLabel>
      <MenuItem iconNode={ICONS.whatsapp} hint="Log expenses by text message" onSelect={run(onWhatsApp)}>
        WhatsApp logging
      </MenuItem>

      <MenuSectionLabel>Preferences</MenuSectionLabel>
      <MenuItem
        iconNode={isDarkMode ? ICONS.sun : ICONS.moon}
        onSelect={onToggleTheme}
        trailing={
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDarkMode ? 'bg-pine' : 'bg-line'}`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </span>
        }
      >
        Dark mode
      </MenuItem>

      <div className="my-1.5 border-t border-line" />
      <MenuItem iconNode={ICONS.signout} tone="danger" onSelect={run(onSignOut)}>
        Sign out
      </MenuItem>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export default function AppHeader(props: AppHeaderProps) {
  const { currentView, onNavigate, onAddExpense } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const toggle = () => {
    if (isDesktop()) setMenuOpen((o) => !o);
    else setDrawerOpen(true);
  };

  // Dropdown: close on outside click / Escape, arrow-key navigation.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !menuButtonRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Drawer: lock page scroll, close on Escape, close if resized to desktop.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => mq.matches && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onChange);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onChange);
    };
  }, [drawerOpen]);

  const currentLabel = NAV_ITEMS.find((n) => n.key === currentView)?.label ?? '';

  return (
    <header className="bg-paper/90 backdrop-blur-md border-b border-line sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:gap-6 h-16">
          {/* Brand */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 shrink-0 rounded-lg text-left"
            aria-label="ExpenseTrack Pro — go to dashboard"
          >
            <span className="w-9 h-9 rounded-lg bg-pine flex items-center justify-center shrink-0">
              <span className="text-base font-display font-semibold text-paper">₹</span>
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-display font-semibold text-ink">ExpenseTrack Pro</span>
              <span className="block md:hidden text-[11px] text-slate font-mono uppercase tracking-wide">{currentLabel}</span>
              <span className="hidden md:block lg:hidden xl:block text-[11px] text-slate font-mono uppercase tracking-wide">
                Your household ledger
              </span>
            </span>
          </button>

          {/* Section tabs — single row on lg+ */}
          <nav className="hidden lg:flex items-center gap-1 h-full" aria-label="Sections">
            <SectionTabs currentView={currentView} onNavigate={onNavigate} />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onAddExpense}
              className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200"
              aria-label="Add expense"
            >
              {ICONS.plus}
              <span className="hidden sm:inline">Add expense</span>
            </button>

            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={menuOpen || drawerOpen}
                aria-label="Open menu"
                className={`inline-flex items-center justify-center gap-2 h-10 px-2.5 lg:px-3 rounded-lg border text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                  menuOpen ? 'border-pine text-pine-strong dark:text-pine bg-surface' : 'border-line bg-surface text-ink hover:border-pine hover:text-pine-strong'
                }`}
              >
                {menuOpen ? ICONS.close : ICONS.menu}
                <span className="hidden lg:inline">Menu</span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    ref={menuRef}
                    role="menu"
                    aria-label="More actions"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full mt-2 w-[300px] max-h-[calc(100vh-96px)] overflow-y-auto card-surface shadow-ledger-lg p-1.5 origin-top-right z-50"
                  >
                    <MenuContent {...props} close={closeMenu} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Section tabs — own row on md (tablet) */}
        <nav className="hidden md:flex lg:hidden gap-1 -mt-1" aria-label="Sections">
          <SectionTabs currentView={currentView} onNavigate={onNavigate} compact />
        </nav>
      </div>

      {/* Mobile drawer — portalled to <body>: the header's backdrop-blur
          makes it the containing block for fixed children, which would
          otherwise clip the drawer to the header's 64px height. */}
      {createPortal(
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <motion.div
              className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute right-0 top-0 bottom-0 w-[min(86vw,340px)] bg-surface border-l border-line shadow-ledger-lg flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className="flex items-center justify-between h-16 px-4 border-b border-line shrink-0">
                <span className="font-display text-lg font-semibold text-ink">Menu</span>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors"
                  aria-label="Close menu"
                  autoFocus
                >
                  {ICONS.close}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-6">
                <MenuSectionLabel>Sections</MenuSectionLabel>
                <nav aria-label="Sections" className="space-y-0.5">
                  {NAV_ITEMS.map((item) => {
                    const active = currentView === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          onNavigate(item.key);
                          closeDrawer();
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          active ? 'bg-pine/10 text-pine-strong dark:text-pine' : 'text-ink hover:bg-paper'
                        }`}
                      >
                        <span className={active ? '' : 'text-slate'}>{VIEW_ICONS[item.key]}</span>
                        {item.label}
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-pine" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </nav>
                <div className="my-2 border-t border-line" />
                <MenuContent {...props} close={closeDrawer} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </header>
  );
}

function SectionTabs({
  currentView,
  onNavigate,
  compact = false,
}: {
  currentView: View;
  onNavigate: (view: View) => void;
  compact?: boolean;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = currentView === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            className={`relative px-3.5 ${compact ? 'py-2.5' : 'h-full'} text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              active ? 'text-ink' : 'text-slate hover:text-ink'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId={compact ? 'nav-underline-compact' : 'nav-underline'}
                className="absolute left-2 right-2 -bottom-px h-0.5 bg-pine rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </>
  );
}
