/**
 * Tailwind Config (v4-style using @tailwindcss/vite plugin)
 * Safelist patterns added for dynamically generated classes in templates.
 * Adjust as new dynamic patterns appear.
 */

export default {
  content: ['./index.html', './src/**/*.{vue,ts,js,tsx,jsx}'],
  safelist: [
    // Button variants / sizes when toggled via dynamic binding
    'btn',
    'btn-xs',
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
    // Fields
    'field',
    'field-row',
    'field-error',
    // Inputs (new generic) + legacy aliases (remove -term variants after migration)
    'input',
    'input-sm',
    'input-lg',
    'textarea',
    'select',
    'input-invalid',
    // Range sliders
    'range',
    'range-sm',
    'range-wrapper',
    'range-vertical',
    'range-bubble',
    'range-bubble-accent',
    'dual-range',
    'dual-range-track-overlay',
    'dual-range-track-active',
    // Legacy (to phase out)
    'input-term',
    'input-term-sm',
    'input-term-lg',
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
          warn: 'var(--color-term-warn)',
          info: 'var(--color-term-info)',
        },
      },
      fontFamily: {
        mono: 'var(--font-mono)',
      },
    },
  },
}
