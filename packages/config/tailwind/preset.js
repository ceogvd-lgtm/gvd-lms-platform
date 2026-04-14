/**
 * LMS Design System — Tailwind preset
 * Tuân thủ Design System trong CLAUDE.md
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand
        primary: {
          DEFAULT: '#1E40AF', // blue-800
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
          DEFAULT: '#7C3AED', // violet-600
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
        // Dark mode surfaces
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
    },
  },
  plugins: [],
};
