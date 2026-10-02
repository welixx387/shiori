/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Onest', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Unbounded', 'Onest', 'ui-sans-serif', 'sans-serif'],
        serif: ['Literata', 'Georgia', 'Times New Roman', 'serif'],
        jp: ['"Shippori Mincho B1"', '"Yu Mincho"', '"Hiragino Mincho ProN"', 'serif'],
        brush: ['"Yuji Syuku"', '"Shippori Mincho B1"', 'serif'],
      },
      colors: {
        bg: { DEFAULT: c('bg'), 2: c('bg-2') },
        surface: { DEFAULT: c('surface'), 2: c('surface-2'), 3: c('surface-3') },
        fg: { DEFAULT: c('fg'), 2: c('fg-2') },
        muted: c('muted'),
        faint: c('faint'),
        line: c('line'),
        accent: { DEFAULT: c('accent'), 2: c('accent-2'), 3: c('accent-3'), 4: c('accent-4') },
        reader: {
          bg: c('r-bg'),
          fg: c('r-fg'),
          muted: c('r-muted'),
          accent: c('r-accent'),
          line: c('r-line'),
          surface: c('r-surface'),
        },
        ok: c('ok'),
        warn: c('warn'),
        danger: c('danger'),
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--r, 0deg))' },
          '50%': { transform: 'translateY(-14px) rotate(var(--r, 0deg))' },
        },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        sway: {
          '0%, 100%': { transform: 'rotate(-4deg)' },
          '50%': { transform: 'rotate(4deg)' },
        },
        blink: { '50%': { opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
        marquee: 'marquee var(--marquee-duration, 40s) linear infinite',
        'marquee-reverse': 'marquee-reverse var(--marquee-duration, 40s) linear infinite',
        float: 'float 6s ease-in-out infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        sway: 'sway 3.2s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
}
