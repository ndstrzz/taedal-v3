import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-brand)',
        accent: 'var(--color-accent)',

        bg: 'var(--color-bg)',
        elev1: 'var(--color-elev-1)',
        elev2: 'var(--color-elev-2)',

        text: 'var(--color-text)',
        subtle: 'var(--color-subtle)',
        border: 'var(--color-border)',

        success: 'var(--color-success)',
        warn: 'var(--color-warn)',
        error: 'var(--color-error)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
      },
    },
  },
  plugins: [],
} satisfies Config
