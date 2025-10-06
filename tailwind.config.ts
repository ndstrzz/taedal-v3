import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        elev1: 'var(--color-elev-1)',
        elev2: 'var(--color-elev-2)',
        text: 'var(--color-text)',
        subtle: 'var(--color-subtle)',
        brand: 'var(--color-brand)',
        accent: 'var(--color-accent)',
        border: 'var(--color-border)',
        success: 'var(--color-success)',
        warn: 'var(--color-warn)',
        error: 'var(--color-error)'
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)'
      },
      boxShadow: {
        card: 'var(--shadow-1)',
        pop: 'var(--shadow-2)'
      },
      fontSize: {
        display: 'clamp(40px, 6vw, 72px)',
        h1: 'clamp(32px, 5vw, 56px)',
        h2: 'clamp(24px, 3.5vw, 36px)',
        body: 'clamp(14px, 1.6vw, 18px)'
      }
    }
  },
  plugins: []
} satisfies Config
