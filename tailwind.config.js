/**
 * Tailwind Config (v4-style using @tailwindcss/vite plugin)
 * Safelist patterns added for dynamically generated classes in templates.
 * Adjust as new dynamic patterns appear.
 */
import { buttonVariantsPlugin } from './tailwind.plugins/buttonVariants.js'

export default {
  content: ['./index.html', './src/**/*.{vue,ts,js,tsx,jsx}'],
  safelist: [
    // Button variants / sizes when toggled via dynamic binding
    'btn',
    'btn-sm',
    'btn-lg',
    'btn-primary',
    'btn-secondary',
    'btn-danger',
    'btn-success',
    'icon-btn',
    // Pills
    'pill',
    'pill-ok',
    'pill-err',
    'pill-warn',
    'pill-info',
    // Status / notice text
    'notice',
    'notice-ok',
    'notice-err',
    // Layout helpers possibly toggled
    'scroll-area',
    'list-row',
    'list-row-hover',
    // Terminal themed inputs
    'input-term',
    'input-term-sm',
    'input-term-lg',
    'input-invalid',
    // Menus
    'menu-dropdown',
    'menu-item',
    'menu-empty',
  ],
  theme: {
    extend: {
      // Optionally mirror CSS variable tokens here for utility generation if needed
      colors: {
        term: {
          bg: 'var(--color-term-bg)',
          fg: 'var(--color-term-fg)',
          dim: 'var(--color-term-dim)',
          accent: 'var(--color-term-accent)',
          border: 'var(--color-term-border)',
          ok: 'var(--color-term-ok)',
          err: 'var(--color-term-err)',
        },
      },
      fontFamily: {
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [buttonVariantsPlugin],
}
