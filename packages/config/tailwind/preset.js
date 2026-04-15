/**
 * LMS Design System — Tailwind preset (Phase 05)
 *
 * Single source of truth for tokens. CSS variables are declared in
 * apps/frontend/src/app/globals.css under :root + .dark; Tailwind classes
 * resolve them via `hsl(var(--token) / <alpha-value>)`.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Semantic, theme-aware (light/dark via CSS vars)
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--text-primary) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--text-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--text-secondary) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--primary) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        error: 'hsl(var(--error) / <alpha-value>)',

        // Brand — kept as static palettes for full numeric scale access.
        // Theme-aware variants use `hsl(var(--primary))` directly.
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(0 0% 100% / <alpha-value>)',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(0 0% 100% / <alpha-value>)',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        // Legacy dark surface tokens kept for components written before
        // the CSS-var migration. New code should use `surface` / `surface-2`.
        dark: {
          bg: '#0F172A',
          surface: '#1E293B',
        },
        // Role badges (CLAUDE.md)
        role: {
          superadmin: '#F59E0B',
          admin: '#3B82F6',
          instructor: '#10B981',
          student: '#6B7280',
        },
      },
      borderRadius: {
        button: '12px',
        card: '16px',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s linear infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
      transitionTimingFunction: {
        'out-quad': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
