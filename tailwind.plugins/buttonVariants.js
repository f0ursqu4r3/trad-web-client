/**
 * Button Variants Tailwind Plugin (palette‑driven + configurable)
 * Encapsulates base button styles, size modifiers, semantic variants, light theme overrides,
 * and generates accent / neutral / tone variants (including outline + ghost styles) from a palette.
 *
 * Options:
 *  - palette: Array<{ name: string; color: string; kind?: 'accent'|'neutral'|'tone' }>
 *            kind determines recipe used. Omit to infer 'tone'.
 *  - dataAttributeMode: boolean (default true)
 *            When true, maps [data-variant="<name>"] & .btn[data-variant="outline-<name>"] etc.
 *  - aliases: boolean (default true)
 *            Adds legacy alias classes (.btn-primary, .btn-secondary) & unified light‑theme overrides.
 */
export function createButtonVariantsPlugin(options = {}) {
  const { palette: userPalette, dataAttributeMode = true, aliases = true } = options

  const BASE_PALETTE = [
    { name: 'primary', color: 'var(--color-term-accent)', kind: 'accent' },
    { name: 'neutral', color: 'rgba(71,85,105,0.6)', kind: 'neutral' },
    { name: 'danger', color: '#ef4444', kind: 'tone' },
    { name: 'success', color: '#10b981', kind: 'tone' },
  ]
  const palette = (userPalette || BASE_PALETTE).filter(Boolean)

  return function buttonVariantsPlugin({ addComponents }) {
    const components = {
      '.btn': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--btn-border)',
        padding: '0.25rem 0.5rem',
        fontSize: '12px',
        fontWeight: '500',
        letterSpacing: '0.5px',
        borderRadius: '0.25rem',
        cursor: 'pointer',
        transition:
          'opacity .15s, transform .15s, box-shadow .15s, background-color .15s, color .15s',
        color: 'var(--btn-fg)',
        background: 'linear-gradient(var(--btn-bg-start), var(--btn-bg-end))',
        boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)',
        textTransform: 'none',
        userSelect: 'none',
        '&:hover:not(:disabled)': { opacity: '0.95' },
        '&:active:not(:disabled)': { transform: 'translateY(1px)' },
        '&:focus-visible': {
          outline: 'none',
          boxShadow: '0 0 0 2px var(--accent-color)',
        },
        '&:disabled': {
          cursor: 'not-allowed',
          opacity: '0.55',
          background: 'var(--panel-bg)',
          color: 'var(--color-text-dim)',
          boxShadow: 'none',
          borderColor: 'var(--border-color)',
        },
        '&[aria-pressed="true"],&[data-pressed="true"]': {
          boxShadow: '0 0 0 2px var(--accent-color), inset 0 0 0 1px var(--accent-color)',
        },
      },
      '.btn-sm': { padding: '0.125rem 0.375rem', fontSize: '11px' },
      '.btn-lg': { padding: '0.375rem 0.75rem', fontSize: '13px' },
      '.btn-group': { display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
      '.icon-btn': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--border-color)',
        padding: '0.25rem 0.375rem',
        fontSize: '12px',
        borderRadius: '0.25rem',
        cursor: 'pointer',
        transition: 'opacity .15s, transform .15s',
        background: 'linear-gradient(var(--btn-bg-start), var(--btn-bg-end))',
        color: 'currentColor',
        boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)',
        '&:hover:not(:disabled)': { opacity: '0.9' },
        '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 2px var(--accent-color)' },
        '&:disabled': {
          cursor: 'not-allowed',
          opacity: '0.5',
          background: 'var(--panel-bg)',
          boxShadow: 'none',
        },
        '&[aria-pressed="true"],&[data-pressed="true"]': {
          boxShadow: '0 0 0 2px var(--accent-color), inset 0 0 0 1px var(--accent-color)',
        },
      },
    }

    for (const { name, color, kind } of palette) {
      let baseVariant
      switch (kind) {
        case 'accent':
          baseVariant = variantAccent(color)
          break
        case 'neutral':
          baseVariant = variantNeutral(color, withAlpha(resolveColor(color), 0.2))
          break
        case 'tone':
        default:
          baseVariant = variantTone(color)
          break
      }
      // Add focus ring override for variant-specific color
      const ringColor = focusRingColor(color)
      baseVariant['&:focus-visible'] = {
        outline: 'none',
        boxShadow: `0 0 0 2px ${ringColor}`,
      }
      components[`.btn-${name}`] = baseVariant
      components[`.btn-outline-${name}`] = withVariantFocus(outlineVariant(color), ringColor)
      components[`.btn-ghost-${name}`] = withVariantFocus(ghostVariant(color), ringColor)

      if (aliases && name === 'primary') {
        components['.btn-primary'] = components['.btn-primary'] || baseVariant
        components['.btn-outline'] =
          components['.btn-outline'] || components['.btn-outline-primary']
        components['.btn-ghost'] = components['.btn-ghost'] || components['.btn-ghost-primary']
      }
      if (aliases && name === 'neutral') {
        components['.btn-secondary'] = baseVariant
      }

      if (dataAttributeMode) {
        // Map attribute selectors to same styles (btn + variant)
        components[`[data-variant="${name}"]`] = components[`[data-variant="${name}"]`] || {}
        Object.assign(components[`[data-variant="${name}"]`], baseVariant)
        // Scoped to .btn element having data-variant (ensures base styles retained when only attribute used)
        components[`.btn[data-variant="${name}"]`] = baseVariant
        // Outline / ghost attribute mapping
        components[`.btn[data-variant="outline-${name}"]`] = components[`.btn-outline-${name}`]
        components[`.btn[data-variant="ghost-${name}"]`] = components[`.btn-ghost-${name}`]
      }
    }

    // Light theme overrides
    components['[data-theme="light"] .btn-primary'] = { color: 'var(--accent-color)' }
    components['[data-theme="light"] .btn-danger'] = {
      color: '#b91c1c',
      borderColor: 'rgba(239,68,68,0.5)',
    }
    components['[data-theme="light"] .btn-success'] = {
      color: '#047857',
      borderColor: 'rgba(16,185,129,0.5)',
    }
    components['[data-theme="light"] .btn-neutral'] = {
      color: '#1e293b',
      borderColor: 'rgba(148,163,184,0.8)',
      '&:hover': { background: 'rgba(148,163,184,0.10)' },
    }
    if (aliases)
      components['[data-theme="light"] .btn-secondary'] =
        components['[data-theme="light"] .btn-neutral']
    addComponents(components)
  }
}

// Maintain backward compatibility export name (default configuration)
export const buttonVariantsPlugin = createButtonVariantsPlugin()

/* Helpers for variant objects */
function variantAccent(accent) {
  return {
    textTransform: 'lowercase',
    borderColor: 'rgba(47,129,247,0.4)',
    background: 'color-mix(in srgb, ' + accent + ' 20%, transparent)',
    color: accent,
    '&:hover': {
      borderColor: 'var(--color-term-accent)',
      background: 'color-mix(in srgb, var(--color-term-accent) 30%, transparent)',
    },
    '&[aria-pressed="true"],&[data-pressed="true"]': {
      background: 'color-mix(in srgb, var(--color-term-accent) 40%, transparent)',
    },
  }
}
function variantNeutral(borderColor, hoverBg) {
  return {
    textTransform: 'lowercase',
    borderColor,
    color: 'rgb(226 232 240)',
    '&:hover': { background: hoverBg },
    '&[aria-pressed="true"],&[data-pressed="true"]': { background: hoverBg },
  }
}
function variantTone(hex) {
  return {
    textTransform: 'lowercase',
    borderColor: toAlpha(hex, 0.4),
    background: toAlpha(hex, 0.1),
    color: toneText(hex),
    '&:hover': { borderColor: hex, background: toAlpha(hex, 0.2) },
    '&[aria-pressed="true"],&[data-pressed="true"]': { background: toAlpha(hex, 0.3) },
  }
}

function outlineVariant(color) {
  return {
    textTransform: 'lowercase',
    background: 'transparent',
    borderColor: toAlpha(resolveColor(color), 0.6),
    color: resolveColor(color),
    '&:hover': {
      background: toAlpha(resolveColor(color), 0.1),
      borderColor: resolveColor(color),
    },
    '&[aria-pressed="true"],&[data-pressed="true"]': {
      background: toAlpha(resolveColor(color), 0.15),
    },
  }
}

function ghostVariant(color) {
  return {
    textTransform: 'lowercase',
    background: 'transparent',
    borderColor: 'transparent',
    color: resolveColor(color),
    boxShadow: 'none',
    '&:hover': {
      background: toAlpha(resolveColor(color), 0.12),
    },
    '&[aria-pressed="true"],&[data-pressed="true"]': {
      background: toAlpha(resolveColor(color), 0.2),
    },
  }
}

// Utility: convert solid hex to rgba with alpha
function toAlpha(hex, alpha) {
  const h = hex.replace('#', '')
  const bigint = parseInt(h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r},${g},${b},${alpha})`
}
// Utility: choose a softer text color for strong hues (basic heuristic)
function toneText(hex) {
  // Determine contrast relative to base backgrounds (light and dark). We'll choose a mid/strong contrast.
  const { r, g, b } = hexToRgb(hex)
  const luminance = relativeLuminance(r, g, b)
  // If color is very bright, darken text; if very dark, lighten text; else use near-original.
  if (luminance > 0.7) return 'rgb(30 41 59)' // slate-800
  if (luminance < 0.25) return 'rgb(248 250 252)' // slate-50
  // Slightly adjust toward full white for midtones to keep readability on tinted backgrounds.
  const blend = blendWithWhite(r, g, b, 0.6)
  return `rgb(${blend.r} ${blend.g} ${blend.b})`
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const bigint = parseInt(h, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}
function relativeLuminance(r, g, b) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}
function blendWithWhite(r, g, b, alpha) {
  const nr = Math.round(r + (255 - r) * alpha)
  const ng = Math.round(g + (255 - g) * alpha)
  const nb = Math.round(b + (255 - b) * alpha)
  return { r: nr, g: ng, b: nb }
}

// Allow colors passed as css vars or rgba/hex; for css var we just return it.
function resolveColor(color) {
  if (color.startsWith('var(')) return color
  return color
}

function focusRingColor(color) {
  return resolveColor(color)
}

function withVariantFocus(variantObj, ringColor) {
  return {
    ...variantObj,
    '&:focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${ringColor}`,
    },
  }
}

// Provide a color -> alpha utility that gracefully handles hex, rgb(a), and CSS vars.
function withAlpha(color, alpha) {
  if (color.startsWith('#')) return toAlpha(color, alpha)
  if (color.startsWith('rgba(')) {
    // replace existing alpha
    return color.replace(/rgba\(([^)]+)\)/, (m, inner) => {
      const parts = inner.split(',').map((p) => p.trim())
      if (parts.length === 4) parts[3] = String(alpha)
      else if (parts.length === 3) parts.push(String(alpha))
      return `rgba(${parts.join(',')})`
    })
  }
  if (color.startsWith('rgb(')) {
    return color.replace(/rgb\(([^)]+)\)/, (m, inner) => `rgba(${inner.trim()}, ${alpha})`)
  }
  // css var or unknown format fallback via color-mix (approximate)
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}

export default buttonVariantsPlugin
