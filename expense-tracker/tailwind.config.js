/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Ledger design system — see src/index.css for the underlying
        // CSS custom properties (light values on :root, lifted values on .dark).
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        slate: 'rgb(var(--slate) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        pine: {
          DEFAULT: 'rgb(var(--pine) / <alpha-value>)',
          strong: 'rgb(var(--pine-strong) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'rgb(var(--brass) / <alpha-value>)',
          strong: 'rgb(var(--brass-strong) / <alpha-value>)',
        },
        ember: {
          DEFAULT: 'rgb(var(--ember) / <alpha-value>)',
          strong: 'rgb(var(--ember-strong) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"Karla"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        ledger: '14px',
      },
      boxShadow: {
        ledger: '0 1px 2px rgb(23 33 29 / 0.04), 0 8px 24px -8px rgb(23 33 29 / 0.10)',
        'ledger-lg': '0 2px 4px rgb(23 33 29 / 0.05), 0 16px 40px -12px rgb(23 33 29 / 0.16)',
        'ledger-inset': 'inset 0 0 0 1px rgb(var(--line) / 1)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        stampIn: {
          '0%': { opacity: '0', transform: 'scale(0.92) rotate(-1.5deg)' },
          '60%': { opacity: '1', transform: 'scale(1.03) rotate(0.5deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        ringPulse: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--pine) / 0.35)' },
          '100%': { boxShadow: '0 0 0 14px rgb(var(--pine) / 0)' },
        },
        shimmerGold: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'stamp-in': 'stampIn 0.42s cubic-bezier(0.16,1,0.3,1) both',
        'ring-pulse': 'ringPulse 0.9s cubic-bezier(0.16,1,0.3,1) both',
        'shimmer-gold': 'shimmerGold 2.4s ease-in-out infinite',
      },
      transitionTimingFunction: {
        ledger: 'cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
