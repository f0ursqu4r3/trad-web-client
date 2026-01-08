<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

import StickyScroller from '@/components/general/StickyScroller.vue'
import ThemeSwitcher from '@/components/general/ThemeSwitcher.vue'
import TinyTable from '@/components/general/TinyTable.vue'
import DualRangeSlider from '@/components/general/DualRangeSlider.vue'
import RangeSlider from '@/components/general/RangeSlider.vue'
import type { TinyTableColumn } from '@/components/general/TinyTable.vue'

// Live nav/scrollspy state
const activeSection = ref('overview')
const filter = ref('')
const asideOpen = ref(true)

// Sections catalog defines order, labels and short guidance
type SectionDef = { id: string; title: string; blurb?: string }
const sectionDefs: SectionDef[] = [
  { id: 'overview', title: 'Overview', blurb: 'Purpose, tokens and theming' },
  { id: 'colors', title: 'Colors', blurb: 'Semantic colors and usage' },
  { id: 'buttons', title: 'Buttons', blurb: 'Primary actions and states' },
  { id: 'inputs', title: 'Inputs', blurb: 'Text fields, selects, toggles' },
  { id: 'ranges', title: 'Ranges', blurb: 'Slider variants' },
  { id: 'status', title: 'Pills & Badges', blurb: 'Status chips and badges' },
  { id: 'notices', title: 'Notices', blurb: 'Inline notice patterns' },
  { id: 'table', title: 'Table', blurb: 'Data table with formatting' },
  { id: 'panels', title: 'Panels & Menus', blurb: 'Panel shell, menus' },
  { id: 'scroller', title: 'Sticky Scroller', blurb: 'Virtualized log list' },
  { id: 'shadows', title: 'Shadows', blurb: 'Elevation scale' },
  { id: 'utilities', title: 'Utilities', blurb: 'Helper classes' },
]

const filteredSections = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return sectionDefs
  return sectionDefs.filter((s) => s.title.toLowerCase().includes(q) || s.id.includes(q))
})

// Token helpers
const displayedTokenKeys = [
  '--color-bg',
  '--color-bg-alt',
  '--panel-bg',
  '--panel-header-bg',
  '--border-color',
  '--color-text',
  '--color-text-dim',
  '--accent-color',
  '--color-success',
  '--color-error',
  '--color-warning',
  '--color-info',
]
const tokenRows = computed(() =>
  displayedTokenKeys.map((k) => ({
    key: k,
    value: getComputedStyle(document.documentElement).getPropertyValue(k).trim(),
  })),
)
const showAllTokens = ref(false)
const copiedTokens = ref(false)
const allTokensJson = ref('')
function collectAllCssVars(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (let i = 0; i < styles.length; i++) {
    const name = styles[i]
    if (name.startsWith('--')) out[name] = styles.getPropertyValue(name).trim()
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}
function refreshAllTokens() {
  const vars = collectAllCssVars()
  allTokensJson.value = JSON.stringify(vars, null, 2)
}
async function copyAllTokens() {
  if (!allTokensJson.value) refreshAllTokens()
  try {
    await navigator.clipboard.writeText(allTokensJson.value)
    copiedTokens.value = true
    setTimeout(() => (copiedTokens.value = false), 1600)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = allTokensJson.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copiedTokens.value = true
    setTimeout(() => (copiedTokens.value = false), 1600)
  }
}

// Demo data
type Row = { id: number; symbol: string; price: number; qty: number; side: 'BUY' | 'SELL' }
const tableColumns: TinyTableColumn[] = [
  { key: 'symbol', label: 'Symbol', stickyLeft: 0 },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'side', label: 'Side' },
]
const tableRows = Array.from({ length: 18 }).map((_, i) => ({
  id: i + 1,
  symbol: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'][i % 6],
  price: 100 + i * 3.37,
  qty: 10 + ((i * 7) % 200),
  side: (i % 2 ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
})) as Row[]
const selectedOrderKey = ref<number | null>(null)

// Buttons playground
const playVariant = ref<
  'primary' | 'secondary' | 'danger' | 'success' | 'neutral' | 'warn' | 'info'
>('primary')
const playStyle = ref<'solid' | 'outline' | 'ghost'>('solid')
const playSize = ref<'default' | 'sm' | 'lg'>('default')
const playPressed = ref(false)
const playDisabled = ref(false)
const playLabel = ref('Click Me')
const copiedBtnMarkup = ref(false)

// Generate the proper .btn class based on playground selections
const playClass = computed(() => {
  const classes = ['btn']

  // Size modifier
  if (playSize.value === 'sm') classes.push('btn-sm')
  else if (playSize.value === 'lg') classes.push('btn-lg')

  // Style + variant combination
  if (playStyle.value === 'solid') {
    classes.push(`btn-${playVariant.value}`)
  } else if (playStyle.value === 'outline') {
    // outline uses btn-outline for primary, btn-outline-{variant} for others
    if (playVariant.value === 'primary') {
      classes.push('btn-outline')
    } else {
      classes.push(`btn-outline-${playVariant.value}`)
    }
  } else if (playStyle.value === 'ghost') {
    // ghost uses btn-ghost for primary, btn-ghost-{variant} for others
    if (playVariant.value === 'primary') {
      classes.push('btn-ghost')
    } else {
      classes.push(`btn-ghost-${playVariant.value}`)
    }
  }

  return classes.join(' ')
})
const playMarkup = computed(
  () =>
    `<button class="${playClass.value}"${playPressed.value ? ' aria-pressed="true"' : ''}${playDisabled.value ? ' disabled' : ''}>${playLabel.value}</button>`,
)
async function copyPlaygroundMarkup() {
  try {
    await navigator.clipboard.writeText(playMarkup.value)
    copiedBtnMarkup.value = true
    setTimeout(() => (copiedBtnMarkup.value = false), 1400)
  } catch {
    /* ignore */
  }
}

// Inputs/ranges state
const inputA = ref('')
const inputB = ref('Some value')
const checkA = ref(true)
const checkB = ref(false)
const radio = ref('a')
const rangeValue = ref(40)
const rangeDualMin = ref(10)
const rangeDualMax = ref(30)
const vertValue = ref(50)

// Menu demo
const openMenu = ref(false)
const menuAnchorRef = ref<HTMLElement | null>(null)
function closeDemoMenu() {
  openMenu.value = false
}
function handleGlobalClick(e: MouseEvent) {
  if (!openMenu.value) return
  const anchor = menuAnchorRef.value
  if (anchor && anchor.contains(e.target as Node)) return
  closeDemoMenu()
}
function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeDemoMenu()
}

// Scrollspy: highlight current section and enable smooth scroll on nav click
let observer: IntersectionObserver | null = null
onMounted(async () => {
  document.addEventListener('mousedown', handleGlobalClick, true)
  window.addEventListener('keydown', handleKey)
  await nextTick()
  const targets = Array.from(document.querySelectorAll('section[id]'))
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      if (visible[0]) activeSection.value = (visible[0].target as HTMLElement).id
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
  )
  targets.forEach((el) => observer!.observe(el))
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleGlobalClick, true)
  window.removeEventListener('keydown', handleKey)
  if (observer) observer.disconnect()
})

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Tiny helper to coerce template slot objects to any for type-checker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function any<T = any>(v: unknown): T {
  return v as T
}

// Log items for StickyScroller demo
const ssitems = ref<Array<{ time: string; level: string; message: string }>>([])
for (let i = 0; i < 80; i++) {
  ssitems.value.push({
    time: new Date().toLocaleTimeString(),
    level: i % 11 === 0 ? 'WARN' : 'INFO',
    message: `Log message #${i + 1}`,
  })
}
</script>

<template>
  <div
    class="styleguide grid grid-cols-[260px_1fr] gap-4 max-w-[1280px] min-h-screen mx-0 my-auto p-4"
  >
    <aside
      class="sg-aside sticky top-4 align-self-start h-[calc(100vh-2rem)]"
      :class="{ hidden: !asideOpen }"
    >
      <div
        class="flex flex-col gap-4 p-3 border border-(--border-color) bg-(--panel-bg) shadow-sm h-full"
        style="border-radius: var(--radius-lg)"
      >
        <div class="flex items-center justify-between">
          <h1 class="m-0 text-[13px] font-mono text-[var(--color-text-dim)]">UI Style Guide</h1>
          <div class="flex items-center gap-2">
            <ThemeSwitcher />
          </div>
        </div>
        <div class="mt-2">
          <input
            v-model="filter"
            placeholder="Filter sections…"
            type="text"
            class="w-full border border-slate-600 bg-[var(--panel-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
            style="border-radius: var(--radius-input)"
          />
        </div>
        <nav class="flex flex-col gap-2 overflow-y-auto">
          <template v-for="s in filteredSections" :key="s.id">
            <a
              href="#"
              class="color-(--color-text) px-2 py-1 text-[12px] hover:bg-(--color-bg-alt) hover:text-(--accent-color) [&.active]:bg-(--accent-color)/14 [&.active]:text-(--accent-color)"
              :class="{ active: activeSection === s.id }"
              style="border-radius: var(--radius-sm)"
              @click.prevent="scrollToSection(s.id)"
            >
              {{ s.title }}
              <span v-if="s.blurb" class="text-[var(--color-text-dim)]"> – {{ s.blurb }}</span></a
            >
          </template>
        </nav>
        <div class="mt-auto text-center border-t border-dashed border-(--border-color) pt-2">
          <p class="m-0 text-[11px] text-[var(--color-text-dim)]">
            This page documents primitives and patterns implemented in the app. Use the exact class
            names shown here to maintain consistency.
          </p>
        </div>
      </div>
    </aside>

    <main class="flex flex-col gap-6 m-0">
      <!-- Overview -->
      <section id="overview" class="py-2">
        <header class="sg-section-header">
          <h2>Overview</h2>
          <p class="text-[var(--color-text-dim)]">Core design tokens, theming and usage.</p>
        </header>
        <div
          class="border border-[var(--border-color)] bg-[var(--panel-bg)] shadow p-0 overflow-hidden"
          style="border-radius: var(--radius-lg)"
        >
          <table class="w-full text-[12px]">
            <thead class="sticky top-0 bg-[var(--panel-header-bg)]">
              <tr>
                <th class="text-left px-3 py-2">Token</th>
                <th class="text-left px-3 py-2">Value</th>
                <th class="text-left px-3 py-2">Swatch</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tokenRows" :key="row.key" class="border-t">
                <td class="px-3 py-2 font-mono">{{ row.key }}</td>
                <td class="px-3 py-2 font-mono text-[var(--color-text-dim)]">{{ row.value }}</td>
                <td class="px-3 py-2">
                  <span
                    class="inline-block w-6 h-4 border border-[var(--border-color)]"
                    :style="{ background: row.value, borderRadius: 'var(--radius-sm)' }"
                  ></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap gap-3 items-center text-[11px] font-mono mt-2">
          <button
            class="inline-flex items-center justify-center border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10 px-2 py-1 text-xs"
            style="border-radius: var(--radius-btn)"
            @click="showAllTokens = !showAllTokens"
          >
            {{ showAllTokens ? 'Hide All Tokens' : 'Show All Tokens' }}
          </button>
          <button
            class="inline-flex items-center justify-center border border-slate-500 text-slate-300 hover:bg-slate-500/10 px-2 py-1 text-xs"
            style="border-radius: var(--radius-btn)"
            @click="copyAllTokens"
          >
            Copy Tokens JSON
          </button>
          <button
            class="inline-flex items-center justify-center bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 text-xs"
            style="border-radius: var(--radius-btn)"
            @click="refreshAllTokens"
          >
            Refresh
          </button>
          <span
            v-if="copiedTokens"
            class="inline-flex items-center bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-semibold"
            style="border-radius: var(--radius-pill)"
            >copied</span
          >
        </div>
        <div v-if="showAllTokens" class="mt-3">
          <pre
            class="block whitespace-pre-wrap max-h-64 overflow-auto text-[11px] leading-snug font-mono bg-[var(--panel-bg)] border border-[var(--border-color)] p-2"
            style="border-radius: var(--radius-base)"
            >{{ allTokensJson }}</pre
          >
        </div>
      </section>

      <!-- Colors -->
      <section id="colors" class="py-2">
        <header class="sg-section-header">
          <h2>Colors</h2>
          <p class="text-[var(--color-text-dim)]">
            Use semantic tokens instead of hard-coded hex values.
          </p>
        </header>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --accent-color
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--accent-color); border-radius: var(--radius-base)"
            ></div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --color-success
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--color-success); border-radius: var(--radius-base)"
            ></div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --color-error
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--color-error); border-radius: var(--radius-base)"
            ></div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --color-warning
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--color-warning); border-radius: var(--radius-base)"
            ></div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --color-info
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--color-info); border-radius: var(--radius-base)"
            ></div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              class="inline-flex items-center border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-mono text-[var(--color-text-dim)]"
              style="border-radius: var(--radius-pill)"
            >
              --color-text
            </div>
            <div
              class="h-12 border border-[var(--border-color)]"
              style="background: var(--color-text); border-radius: var(--radius-base)"
            ></div>
          </div>
        </div>
      </section>

      <!-- Buttons -->
      <section id="buttons" class="py-2">
        <header class="sg-section-header">
          <h2>Buttons</h2>
          <p class="dim">Variants, outline/ghost, sizes, and states.</p>
        </header>
        <div class="flex flex-wrap gap-3 items-center mb-3">
          <button class="btn btn-primary">primary</button>
          <button class="btn btn-secondary">secondary</button>
          <button class="btn btn-danger">danger</button>
          <button class="btn btn-success">success</button>
          <button class="btn btn-neutral">neutral</button>
          <button class="btn btn-warn">warn</button>
          <button class="btn btn-info">info</button>
        </div>
        <div class="flex flex-wrap gap-3 items-center mb-3">
          <button class="btn btn-outline">outline</button>
          <button class="btn btn-outline-danger">outline danger</button>
          <button class="btn btn-outline-success">outline success</button>
          <button class="btn btn-outline-neutral">outline neutral</button>
          <button class="btn btn-outline-warn">outline warn</button>
          <button class="btn btn-outline-info">outline info</button>
        </div>
        <div class="flex flex-wrap gap-3 items-center mb-3">
          <button class="btn btn-ghost">ghost</button>
          <button class="btn btn-ghost-danger">ghost danger</button>
          <button class="btn btn-ghost-success">ghost success</button>
          <button class="btn btn-ghost-neutral">ghost neutral</button>
          <button class="btn btn-ghost-warn">ghost warn</button>
          <button class="btn btn-ghost-info">ghost info</button>
        </div>
        <div class="flex flex-wrap gap-3 items-center mb-4">
          <button class="btn btn-primary btn-xs">primary xs</button>
          <button class="btn btn-primary btn-sm">primary sm</button>
          <button class="btn btn-primary btn-lg">primary lg</button>
          <button class="btn icon-btn" aria-label="settings">⚙</button>
          <button class="btn btn-primary" aria-pressed="true">pressed</button>
          <button class="btn btn-secondary" disabled>disabled</button>
        </div>

        <div class="panel-card shadow p-3 flex flex-col gap-3 max-w-2xl">
          <h3 class="m-0 text-sm font-mono">Playground</h3>
          <div class="grid sm:grid-cols-3 gap-3 text-[12px]">
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0 dim font-mono">Variant</span>
              <select v-model="playVariant as any" class="input flex-1">
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
                <option value="danger">danger</option>
                <option value="success">success</option>
                <option value="neutral">neutral</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
              </select>
            </label>
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0 dim font-mono">Style</span>
              <select v-model="playStyle as any" class="input flex-1">
                <option value="solid">solid</option>
                <option value="outline">outline</option>
                <option value="ghost">ghost</option>
              </select>
            </label>
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0 dim font-mono">Size</span>
              <select v-model="playSize as any" class="input flex-1">
                <option value="default">default</option>
                <option value="sm">sm</option>
                <option value="lg">lg</option>
              </select>
            </label>
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0 dim font-mono">Label</span>
              <input v-model="playLabel" class="input flex-1" />
            </label>
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0 dim font-mono">Flags</span>
              <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" v-model="playPressed" />
                <span class="dim font-mono">pressed</span>
              </label>
            </label>
            <label class="flex items-center gap-2">
              <span class="w-14 shrink-0"></span>
              <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" v-model="playDisabled" />
                <span class="dim font-mono">disabled</span>
              </label>
            </label>
          </div>
          <div class="flex items-center justify-center gap-4 my-6">
            <button :class="playClass" :aria-pressed="playPressed" :disabled="playDisabled">
              {{ playLabel }}
            </button>
          </div>
          <div class="flex items-center gap-4 justify-end">
            <button
              class="inline-flex items-center justify-center border border-slate-500 text-slate-300 hover:bg-slate-500/10 px-2 py-1 text-xs"
              style="border-radius: var(--radius-btn)"
              @click="copyPlaygroundMarkup"
            >
              Copy markup
            </button>
            <span
              v-if="copiedBtnMarkup"
              class="inline-flex items-center bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-semibold"
              style="border-radius: var(--radius-pill)"
            >
              copied
            </span>
          </div>
          <pre
            class="font-mono text-[11px] whitespace-pre-wrap bg-[var(--panel-bg)] border border-[var(--border-color)] p-2"
            style="border-radius: var(--radius-base)"
            >{{ playMarkup }}</pre
          >
        </div>
      </section>

      <!-- Inputs -->
      <section id="inputs" class="py-2">
        <header class="sg-section-header">
          <h2>Inputs</h2>
          <p class="text-[var(--color-text-dim)]">Standardized field styles and states.</p>
        </header>
        <div class="grid md:grid-cols-2 gap-8 max-w-4xl">
          <div class="flex flex-col gap-3 max-w-md">
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[11px] text-[var(--color-text-dim)]">Label</span>
              <input
                v-model="inputA"
                placeholder="Placeholder"
                class="w-full border border-slate-600 bg-[var(--panel-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
                style="border-radius: var(--radius-input)"
              />
              <span class="text-[var(--color-text-dim)] text-[11px]">Helper text</span>
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[11px] text-[var(--color-text-dim)]">Disabled</span>
              <input
                disabled
                placeholder="Disabled"
                class="w-full border border-slate-600 bg-[var(--panel-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                style="border-radius: var(--radius-input)"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[11px] text-[var(--color-text-dim)]">Invalid</span>
              <input
                placeholder="Invalid"
                class="w-full border border-rose-600 bg-[var(--panel-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-600 focus:border-transparent"
                style="border-radius: var(--radius-input)"
              />
              <span class="text-[11px] text-rose-400">Error message</span>
            </label>
          </div>
          <div class="space-y-4">
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[11px] text-[var(--color-text-dim)]">Select</span>
              <select
                v-model="inputB"
                class="w-full border border-slate-600 bg-[var(--panel-bg)] text-[var(--color-text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent"
                style="border-radius: var(--radius-input)"
              >
                <option>Some value</option>
                <option>Another value</option>
              </select>
            </label>
            <div class="flex items-center gap-6">
              <label class="flex items-center gap-2"
                ><input type="checkbox" v-model="checkA" />
                <span class="font-mono">Checkbox A</span></label
              >
              <label class="flex items-center gap-2"
                ><input type="checkbox" v-model="checkB" />
                <span class="font-mono">Checkbox B</span></label
              >
            </div>
            <div class="flex items-center gap-6">
              <label class="flex items-center gap-2"
                ><input type="radio" value="a" v-model="radio" />
                <span class="font-mono">Radio A</span></label
              >
              <label class="flex items-center gap-2"
                ><input type="radio" value="b" v-model="radio" />
                <span class="font-mono">Radio B</span></label
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Ranges -->
      <section id="ranges" class="py-2">
        <header class="sg-section-header">
          <h2>Ranges</h2>
          <p class="dim">Slider components with custom styling.</p>
        </header>
        <div class="grid gap-10 md:grid-cols-2 max-w-5xl">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] dim">Standard</span>
              <span class="font-mono">{{ rangeValue }}</span>
            </div>
            <RangeSlider v-model="rangeValue" />
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] dim">Small</span>
              <span class="font-mono">{{ rangeValue }}</span>
            </div>
            <RangeSlider v-model="rangeValue" size="sm" />
          </div>
          <div class="space-y-2 md:col-span-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] dim">Dual Range</span>
              <span class="font-mono">{{ rangeDualMin }} – {{ rangeDualMax }}</span>
            </div>
            <DualRangeSlider
              v-model:minValue="rangeDualMin"
              v-model:maxValue="rangeDualMax"
              :min="0"
              :max="rangeValue"
            />
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] dim">Vertical</span>
              <span class="font-mono">{{ vertValue }}</span>
            </div>
            <RangeSlider v-model="vertValue" vertical show-bubble :height="160" />
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] dim">With Bubble</span>
              <span class="font-mono">{{ rangeValue }}</span>
            </div>
            <RangeSlider v-model="rangeValue" show-bubble />
          </div>
        </div>
      </section>

      <!-- Status -->
      <section id="status" class="py-2">
        <header class="sg-section-header">
          <h2>Pills & Badges</h2>
          <p class="dim">Use pills for transient status, badges for metadata.</p>
        </header>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="pill">default</span>
          <span class="pill pill-ok">ok</span>
          <span class="pill pill-err">err</span>
          <span class="pill pill-warn">warn</span>
          <span class="pill pill-info">info</span>
          <span class="badge">badge</span>
          <span class="chip">chip</span>
        </div>
      </section>

      <!-- Notices -->
      <section id="notices" class="py-2">
        <header class="sg-section-header">
          <h2>Notices</h2>
          <p class="dim">Inline feedback blocks.</p>
        </header>
        <div class="space-y-1 text-[13px]">
          <p class="notice">Generic notice text</p>
          <p class="notice-ok">Success notice text</p>
          <p class="notice-err">Error notice text</p>
        </div>
      </section>

      <!-- Tiny Table -->
      <section id="table" class="py-2">
        <header class="sg-section-header">
          <h2>Table</h2>
          <p class="dim">Lightweight scrollable table with sticky header.</p>
        </header>
        <div class="max-w-2xl">
          <TinyTable
            :columns="tableColumns"
            :rows="tableRows"
            row-key="id"
            hover
            striped
            v-model:selectedKey="selectedOrderKey"
          >
            <template #cell-price="{ value }">
              <span class="font-mono">{{ value.toFixed(2) }}</span>
            </template>
            <template #cell-qty="{ value }">
              <span class="font-mono">{{ value }}</span>
            </template>
            <template #cell-side="{ value }">
              <span
                :class="[
                  'inline-flex items-center px-2 py-0.5 text-xs font-semibold',
                  value === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white',
                ]"
                :style="{ borderRadius: 'var(--radius-pill)' }"
                >{{ value }}</span
              >
            </template>
          </TinyTable>
          <p class="mt-2 text-[11px] text-[var(--color-text-dim)] font-mono">
            Selected: {{ selectedOrderKey ?? 'none' }}
          </p>
        </div>
      </section>

      <!-- Panels & Menus -->
      <section id="panels" class="py-2">
        <header class="sg-section-header">
          <h2>Panels & Menus</h2>
          <p class="text-[var(--color-text-dim)]">Panel shells, headings, and anchored menus.</p>
        </header>
        <div class="grid md:grid-cols-2 gap-6 max-w-4xl">
          <div
            class="border border-[var(--border-color)] bg-[var(--panel-bg)] shadow"
            style="border-radius: var(--radius-lg)"
          >
            <div
              class="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--panel-header-bg)] text-[13px] font-medium"
              style="border-radius: var(--radius-lg) var(--radius-lg) 0 0"
            >
              Panel Header
            </div>
            <div class="p-3 text-[13px] text-[var(--color-text-dim)]">
              Use panels to group related controls and content.
            </div>
          </div>
          <div class="relative" ref="menuAnchorRef">
            <button
              class="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium border border-slate-500 text-slate-300 hover:bg-slate-500/10"
              style="border-radius: var(--radius-btn)"
              @click="openMenu = !openMenu"
            >
              Toggle Menu
            </button>
            <div
              v-if="openMenu"
              class="absolute left-0 mt-1 min-w-[180px] border border-[var(--border-color)] bg-[var(--panel-bg)] shadow-xl p-1 z-20"
              style="border-radius: var(--radius-menu)"
              role="menu"
            >
              <button
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-[var(--color-bg-alt)]"
                style="border-radius: var(--radius-base)"
              >
                New
              </button>
              <button
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-[var(--color-bg-alt)]"
                style="border-radius: var(--radius-base)"
              >
                Duplicate
              </button>
              <button
                class="w-full text-left px-2 py-1.5 text-sm hover:bg-[var(--color-bg-alt)]"
                style="border-radius: var(--radius-base)"
                @click="closeDemoMenu"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Sticky Scroller -->
      <section id="scroller" class="py-2">
        <header class="sg-section-header">
          <h2>Sticky Scroller</h2>
          <p class="dim">Auto-scroll log list with optional pause button.</p>
        </header>
        <div class="h-64 max-w-xl overflow-hidden panel-card">
          <StickyScroller :items="ssitems" itemHeight="24" :showButton="true">
            <template #default="slot">
              <div class="grid grid-cols-[100px_60px_1fr] gap-2 items-center px-2 py-1 text-sm">
                <span class="font-mono dim">{{ any(slot).time }}</span>
                <span
                  class="font-mono"
                  :class="any(slot).level === 'WARN' ? 'text-warning' : 'text-info'"
                >
                  {{ any(slot).level }}
                </span>
                <span class="truncate">{{ any(slot).message }}</span>
              </div>
            </template>
          </StickyScroller>
        </div>
      </section>

      <!-- Shadows -->
      <section id="shadows" class="py-2">
        <header class="sg-section-header">
          <h2>Shadows</h2>
          <p class="dim">Elevation scale for panels and overlays.</p>
        </header>
        <div class="flex flex-wrap gap-6 items-center">
          <div
            class="w-28 h-16 bg-[var(--panel-bg)] shadow-sm flex items-center justify-center text-[11px] dim"
            style="border-radius: var(--radius-lg)"
          >
            sm
          </div>
          <div
            class="w-28 h-16 bg-[var(--panel-bg)] shadow flex items-center justify-center text-[11px] dim"
            style="border-radius: var(--radius-lg)"
          >
            base
          </div>
          <div
            class="w-28 h-16 bg-[var(--panel-bg)] shadow-md flex items-center justify-center text-[11px] dim"
            style="border-radius: var(--radius-lg)"
          >
            md
          </div>
          <div
            class="w-28 h-16 bg-[var(--panel-bg)] shadow-lg flex items-center justify-center text-[11px] dim"
            style="border-radius: var(--radius-lg)"
          >
            lg
          </div>
          <div
            class="w-28 h-16 bg-[var(--panel-bg)] shadow-xl flex items-center justify-center text-[11px] dim"
            style="border-radius: var(--radius-lg)"
          >
            xl
          </div>
        </div>
      </section>

      <!-- Utilities -->
      <section id="utilities" class="py-2">
        <header class="sg-section-header">
          <h2>Utilities</h2>
          <p class="dim">Helper classes shared across the app.</p>
        </header>
        <div class="flex flex-wrap gap-3 items-center text-[12px]">
          <span class="code-inline">.code-inline</span>
          <span class="kbd">⌘K</span>
          <span class="pill pill-info">.text-accent</span>
          <span class="badge">.mono</span>
          <span class="chip">.dim (muted)</span>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.sg-section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.sg-section h2 {
  margin: 0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 16px;
  scroll-margin-top: 72px;
}

@media (max-width: 960px) {
  .styleguide {
    grid-template-columns: 1fr;
  }
  .sg-aside {
    position: static;
    height: auto;
  }
}
</style>
