<script setup lang="ts">
import { ref, type Ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

import StickyScroller from '@/components/general/StickyScroller.vue'
import ThemeSwitcher from '@/components/general/ThemeSwitcher.vue'
import TinyTable from '@/components/general/TinyTable.vue'
import type { TinyTableColumn } from '@/components/general/TinyTable.vue'

/* --------------------------------------------------
 * Demo Data
 * -------------------------------------------------- */
const ssitems: Ref<Array<{ time: string; level: string; message: string }>> = ref([])
for (let i = 0; i < 60; i++) {
  ssitems.value.push({
    time: new Date().toLocaleTimeString(),
    level: i % 11 === 0 ? 'WARN' : 'INFO',
    message: `Log message #${i + 1}`,
  })
}

const tableColumns: TinyTableColumn[] = [
  { key: 'symbol', label: 'Symbol', stickyLeft: 0 },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'side', label: 'Side' },
]
const tableRows = Array.from({ length: 14 }).map((_, i) => ({
  id: i + 1,
  symbol: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'][i % 6],
  price: 100 + i * 3.37,
  qty: 10 + ((i * 7) % 200),
  side: i % 2 ? 'BUY' : 'SELL',
}))
const selectedOrderKey = ref<number | null>(null)

/* --------------------------------------------------
 * Demo panel menu state (Panels & Menus section)
 * -------------------------------------------------- */
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

/* --------------------------------------------------
 * Range slider demos
 * -------------------------------------------------- */
const rangeValue = ref(40)
const rangeValueSm = ref(25)
const rangeDualMin = ref(20)
const rangeDualMax = ref(70)
const vertValue = ref(50)

/* --------------------------------------------------
 * Checkbox / Radio demo state
 * -------------------------------------------------- */
const checkA = ref(true)
const checkB = ref(false)
const radio = ref('a')

/* --------------------------------------------------
 * Token Introspection (subset for brevity in UI)
 * -------------------------------------------------- */
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
const tokens = computed(() =>
  displayedTokenKeys.map((k) => ({
    key: k,
    value: getComputedStyle(document.documentElement).getPropertyValue(k).trim(),
  })),
)

// Full token export utilities
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
    setTimeout(() => (copiedTokens.value = false), 1800)
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = allTokensJson.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copiedTokens.value = true
    setTimeout(() => (copiedTokens.value = false), 1800)
  }
}

/* --------------------------------------------------
 * Section anchor helper
 * -------------------------------------------------- */
const sections = [
  'overview',
  'colors',
  'buttons',
  'inputs',
  'ranges',
  'selection-controls',
  'status-pills-badges',
  'notices',
  'table',
  'panels-menus',
  'sticky-scroller',
  'utilities',
]

/* --------------------------------------------------
 * Button playground state
 * -------------------------------------------------- */
const playVariant = ref<
  'primary' | 'secondary' | 'danger' | 'success' | 'neutral' | 'warn' | 'info'
>('primary')
const playStyle = ref<'solid' | 'outline' | 'ghost'>('solid')
const playSize = ref<'default' | 'sm' | 'lg'>('default')
const playPressed = ref(false)
const playDisabled = ref(false)
const playLabel = ref('Click Me')
const copiedBtnMarkup = ref(false)

function normalizedOutlineGhostSuffix(v: string) {
  return ['neutral', 'secondary'].includes(v) ? 'neutral' : v
}

const playClass = computed(() => {
  const classes: string[] = ['btn']
  if (playStyle.value === 'solid') {
    if (playVariant.value === 'secondary') classes.push('btn-secondary')
    else classes.push(`btn-${playVariant.value}`)
  } else if (playStyle.value === 'outline') {
    const suf = normalizedOutlineGhostSuffix(playVariant.value)
    classes.push(`btn-outline${suf === 'primary' ? '' : '-' + suf}`)
  } else if (playStyle.value === 'ghost') {
    const suf = normalizedOutlineGhostSuffix(playVariant.value)
    classes.push(`btn-ghost${suf === 'primary' ? '' : '-' + suf}`)
  }
  if (playSize.value === 'sm') classes.push('btn-sm')
  else if (playSize.value === 'lg') classes.push('btn-lg')
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
    setTimeout(() => (copiedBtnMarkup.value = false), 1500)
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------
 * Lifecycle for outside click / escape (menu demo & token refresh on theme change?)
 * -------------------------------------------------- */
onMounted(() => {
  document.addEventListener('mousedown', handleGlobalClick, true)
  window.addEventListener('keydown', handleKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleGlobalClick, true)
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <div class="p-6 space-y-14 max-w-7xl mx-auto">
    <!-- Header / Nav -->
    <div class="flex items-start justify-between flex-wrap gap-6">
      <div class="space-y-2">
        <h1 class="text-xl font-mono m-0">UI Style Guide</h1>
        <p class="text-[13px] max-w-xl text-[var(--color-text-dim)]">
          Living reference for core UI primitives, semantic tokens, and reusable components. Each
          section below reflects current implementation. Use this to develop & review new UI changes
          quickly.
        </p>
        <nav class="flex flex-wrap gap-2 text-[11px] font-mono">
          <a
            v-for="s in sections"
            :key="s"
            class="px-2 py-1 rounded border hover:bg-white/5"
            :href="'#' + s"
            >{{ s }}</a
          >
        </nav>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">Theme</span>
        <ThemeSwitcher />
      </div>
    </div>

    <!-- Overview / Tokens -->
    <section id="overview" class="space-y-4">
      <h2 class="text-lg font-mono">Overview</h2>
      <p class="text-[13px] text-[var(--color-text-dim)]">Core design tokens sample:</p>
      <div class="overflow-auto border rounded" style="max-height: 240px">
        <table class="w-full text-[12px]">
          <thead class="sticky top-0 bg-[var(--panel-header-bg)]">
            <tr>
              <th class="text-left p-2 border-b border-[var(--border-color)]">Token</th>
              <th class="text-left p-2 border-b border-[var(--border-color)]">Value</th>
              <th class="text-left p-2 border-b border-[var(--border-color)]">Swatch</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tokens" :key="t.key" class="border-b border-[var(--border-color)]/40">
              <td class="p-2 font-mono">{{ t.key }}</td>
              <td class="p-2 text-[var(--color-text-dim)] font-mono">{{ t.value }}</td>
              <td class="p-2">
                <div class="w-8 h-4 rounded border" :style="{ background: `var(${t.key})` }"></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap gap-3 items-center text-[11px] font-mono mt-2">
        <button
          class="btn btn-sm btn-outline-info"
          @click="
            () => {
              showAllTokens = !showAllTokens
              if (showAllTokens) {
                refreshAllTokens()
                nextTick(() => refreshAllTokens())
              }
            }
          "
        >
          {{ showAllTokens ? 'Hide All Tokens' : 'Show All Tokens' }}
        </button>
        <button
          class="btn btn-sm btn-outline"
          @click="
            () => {
              if (!allTokensJson) refreshAllTokens()
              copyAllTokens()
            }
          "
        >
          Copy Tokens JSON
        </button>
        <span v-if="copiedTokens" class="pill pill-ok">copied</span>
      </div>
      <div v-if="showAllTokens" class="mt-3">
        <pre
          class="code-inline block whitespace-pre-wrap max-h-64 overflow-auto text-[11px] leading-snug"
          >{{ allTokensJson }}</pre
        >
      </div>
    </section>

    <section id="buttons">
      <h2 class="text-lg font-mono mb-2">Buttons</h2>
      <div class="flex flex-col gap-3">
        <h3 class="font-mono text-sm">Variants</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-primary">primary</button>
          <button class="btn btn-secondary">secondary</button>
          <button class="btn btn-danger">danger</button>
          <button class="btn btn-success">success</button>
          <button class="btn btn-neutral">neutral</button>
          <button class="btn btn-warn">warn</button>
          <button class="btn btn-info">info</button>
        </div>

        <h3 class="font-mono text-sm">Outline</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-outline">outline</button>
          <button class="btn btn-outline-danger">outline danger</button>
          <button class="btn btn-outline-success">outline success</button>
          <button class="btn btn-outline-neutral">outline neutral</button>
          <button class="btn btn-outline-warn">outline warn</button>
          <button class="btn btn-outline-info">outline info</button>
        </div>

        <h3 class="font-mono text-sm">Ghost</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-ghost">ghost</button>
          <button class="btn btn-ghost-danger">ghost danger</button>
          <button class="btn btn-ghost-success">ghost success</button>
          <button class="btn btn-ghost-neutral">ghost neutral</button>
          <button class="btn btn-ghost-warn">ghost warn</button>
          <button class="btn btn-ghost-info">ghost info</button>
        </div>

        <h3 class="font-mono text-sm">Sizes & States</h3>
        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn btn-primary btn-sm">primary sm</button>
          <button class="btn btn-primary btn-lg">primary lg</button>
          <button class="btn icon-btn" aria-label="settings">⚙</button>
          <button class="btn btn-primary" aria-pressed="true">pressed</button>
          <button class="btn btn-secondary" disabled>disabled</button>
        </div>

        <h3 class="font-mono text-sm mt-4">Playground</h3>
        <div class="panel-card p-3 flex flex-col gap-3 max-w-2xl">
          <div class="grid sm:grid-cols-3 gap-3 text-[12px] items-start">
            <label class="flex flex-col gap-1">
              <span class="dim">Variant</span>
              <select v-model="playVariant" class="select">
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
                <option value="neutral">neutral</option>
                <option value="danger">danger</option>
                <option value="success">success</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="dim">Style</span>
              <select v-model="playStyle" class="select">
                <option value="solid">solid</option>
                <option value="outline">outline</option>
                <option value="ghost">ghost</option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="dim">Size</span>
              <select v-model="playSize" class="select">
                <option value="default">default</option>
                <option value="sm">sm</option>
                <option value="lg">lg</option>
              </select>
            </label>
            <label class="flex items-center gap-2 mt-1">
              <input type="checkbox" v-model="playPressed" />
              <span class="dim text-[12px]">aria-pressed</span>
            </label>
            <label class="flex items-center gap-2 mt-1">
              <input type="checkbox" v-model="playDisabled" />
              <span class="dim text-[12px]">disabled</span>
            </label>
            <label class="flex flex-col gap-1">
              <span class="dim">Label</span>
              <input class="input" v-model="playLabel" />
            </label>
          </div>
          <div class="flex items-center gap-4">
            <button
              :class="playClass"
              :aria-pressed="playPressed ? 'true' : undefined"
              :disabled="playDisabled"
            >
              {{ playLabel }}
            </button>
            <code class="code-inline text-[10px] break-all">{{ playClass }}</code>
          </div>
          <div class="flex gap-2 text-[11px]">
            <button class="btn btn-sm btn-outline-info" @click="copyPlaygroundMarkup">
              Copy Markup
            </button>
            <span v-if="copiedBtnMarkup" class="pill-ok">copied</span>
          </div>
          <pre
            class="code-inline block whitespace-pre-wrap text-[10px] leading-snug overflow-auto max-h-40"
            >{{ playMarkup }}</pre
          >
        </div>
      </div>
    </section>

    <section id="status-pills-badges">
      <h2 class="text-lg font-mono mb-2">Status Pills & Badges</h2>
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

    <section id="inputs">
      <h2 class="text-lg font-mono mb-2">Inputs</h2>
      <div class="grid md:grid-cols-2 gap-8 max-w-4xl">
        <div class="flex flex-col gap-3 max-w-md">
          <input class="input w-full" placeholder="Standard input" />
          <input class="input input-sm w-full" placeholder="Small input" />
          <input class="input input-lg w-full" placeholder="Large input" />
          <input class="input input-invalid w-full" value="invalid state" />
          <textarea class="textarea" placeholder="Textarea"></textarea>
          <select name="" id="">
            <option value="" disabled selected>Select an option</option>
            <option value="1">Option 1</option>
            <option value="2">Option 2</option>
            <option value="3">Option 3</option>
          </select>
        </div>
        <div class="space-y-4">
          <h3 class="font-mono text-sm">Checkboxes & Radios</h3>
          <div class="flex flex-col gap-3 text-[13px]">
            <label class="choice-item"> <input type="checkbox" v-model="checkA" /> Checked </label>
            <label class="choice-item">
              <input type="checkbox" v-model="checkB" /> Unchecked
            </label>
            <div class="choice-group">
              <label class="choice-item">
                <input type="radio" name="demoRadio" value="a" v-model="radio" /> Radio A
              </label>
              <label class="choice-item">
                <input type="radio" name="demoRadio" value="b" v-model="radio" /> Radio B
              </label>
            </div>
            <div class="flex gap-3 items-center">
              <span class="checkbox checkbox-sm" :class="{ checked: true }" checked></span>
              <span class="radio radio-sm" :class="{ checked: true }" checked></span>
              <span class="text-[11px] text-[var(--color-text-dim)]">(raw size variants)</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="ranges">
      <h2 class="text-lg font-mono mb-2">Range Sliders</h2>
      <div class="grid gap-10 md:grid-cols-2 max-w-5xl">
        <!-- Standard -->
        <div class="space-y-4">
          <h3 class="font-mono text-sm">Standard</h3>
          <input type="range" v-model="rangeValue" class="range" min="0" max="100" />
          <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
            Value: {{ rangeValue }}
          </div>
        </div>
        <!-- Small -->
        <div class="space-y-4">
          <h3 class="font-mono text-sm">Small</h3>
          <input type="range" v-model="rangeValueSm" class="range range-sm" min="0" max="100" />
          <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
            Value: {{ rangeValueSm }}
          </div>
        </div>
        <!-- Dual (two simple inputs) -->
        <div class="space-y-4 md:col-span-2">
          <h3 class="font-mono text-sm">Dual (Min / Max)</h3>
          <div class="flex flex-col gap-2 max-w-md">
            <div class="flex items-center gap-3">
              <label class="text-[11px] dim w-8 text-right">Min</label>
              <input
                type="range"
                v-model="rangeDualMin"
                class="range flex-1"
                :max="rangeDualMax"
                min="0"
              />
              <span class="text-[11px] font-mono w-10 text-right">{{ rangeDualMin }}</span>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-[11px] dim w-8 text-right">Max</label>
              <input
                type="range"
                v-model="rangeDualMax"
                class="range flex-1"
                :min="rangeDualMin"
                max="100"
              />
              <span class="text-[11px] font-mono w-10 text-right">{{ rangeDualMax }}</span>
            </div>
          </div>
          <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
            Range: {{ rangeDualMin }} → {{ rangeDualMax }}
          </div>
          <p class="text-[11px] text-[var(--color-text-dim)] m-0">
            Simplified: two native inputs constrain each other (no custom thumbs / overlays).
          </p>
        </div>
        <!-- Vertical -->
        <div class="space-y-4">
          <h3 class="font-mono text-sm">Vertical</h3>
          <input type="range" v-model="vertValue" class="range vertical-range" min="0" max="100" />
          <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
            Value: {{ vertValue }}
          </div>
        </div>
      </div>
    </section>

    <section id="notices">
      <h2 class="text-lg font-mono mb-2">Notices</h2>
      <div class="space-y-1 text-[13px]">
        <p class="notice">Generic notice text</p>
        <p class="notice-ok">Success notice text</p>
        <p class="notice-err">Error notice text</p>
      </div>
    </section>

    <section id="table" class="space-y-4">
      <h2 class="text-lg font-mono mb-2">Tiny Table</h2>
      <p class="text-[13px] text-[var(--color-text-dim)] max-w-2xl">
        Lightweight scrollable table with sticky header, optional selection, striped & hover
        modifiers. Demonstrates custom cell slots for formatting.
      </p>
      <div class="max-w-2xl">
        <TinyTable
          :columns="tableColumns"
          :rows="tableRows"
          row-key="id"
          :max-height="180"
          striped
          hover
          selectable
          v-model:selectedKey="selectedOrderKey"
        >
          <template #cell-price="{ value }">{{ Number(value).toFixed(2) }}</template>
          <template #cell-side="{ value }">
            <span :class="value === 'BUY' ? 'text-accent' : 'dim'">{{ value }}</span>
          </template>
          <template #empty>
            <span class="muted">No rows</span>
          </template>
        </TinyTable>
        <p class="mt-2 text-[11px] text-[var(--color-text-dim)] font-mono">
          Selected Key: <span class="text-accent">{{ selectedOrderKey ?? '—' }}</span>
        </p>
      </div>
    </section>

    <section id="panels-menus" class="space-y-4">
      <h2 class="text-lg font-mono mb-2">Panels & Menus</h2>
      <div class="grid md:grid-cols-2 gap-6 max-w-4xl">
        <div class="panel-card">
          <div class="panel-header-row">Panel Header</div>
          <div class="p-3 text-[13px] space-y-2">
            <p class="m-0">Panel body content. Use <code class="code-inline">.panel-card</code>.</p>
            <hr class="section-divider" />
            <p class="m-0 text-[11px] text-[var(--color-text-dim)]">Footer / meta area</p>
          </div>
        </div>
        <div class="relative" ref="menuAnchorRef">
          <div class="menu-anchor">
            <button
              class="btn btn-ghost-primary"
              @click="openMenu = !openMenu"
              @keydown.escape.stop.prevent="openMenu = false"
            >
              Menu Demo
            </button>
            <div
              v-if="openMenu"
              class="menu-dropdown"
              style="position: absolute; right: 0; top: 110%; width: max-content"
            >
              <div class="menu-item selected">Selected Item</div>
              <div class="menu-item">Regular Item</div>
              <div class="menu-item" disabled>Disabled Item</div>
              <div class="menu-item">Another Item</div>
            </div>
          </div>
          <p class="text-[11px] mt-3 text-[var(--color-text-dim)]">
            Uses <code class="code-inline">.menu-dropdown</code> & related classes.
          </p>
        </div>
      </div>
    </section>

    <section id="sticky-scroller" class="space-y-4">
      <h2 class="text-lg font-mono mb-2">Sticky Scroller</h2>
      <div class="h-64 max-w-xl overflow-hidden rounded border border-[var(--border-color)]">
        <StickyScroller
          class="list striped"
          :trigger="ssitems.length"
          :smooth="true"
          :showButton="true"
        >
          <div v-for="(item, index) in ssitems" :key="index" class="row">
            <span class="time">{{ item.time }}</span>
            <span
              class="font-bold pill"
              :class="
                item.level === 'WARN'
                  ? 'pill-warn px-1.5 py-0.5 rounded-full text-[10px]'
                  : 'text-accent'
              "
            >
              {{ item.level }}
            </span>
            <pre class="payload">{{ item.message }}</pre>
          </div>
          <div v-if="ssitems.length === 0" class="empty">No log messages yet.</div>
        </StickyScroller>
      </div>
    </section>

    <section id="utilities" class="space-y-4">
      <h2 class="text-lg font-mono mb-2">Utilities / Helpers</h2>
      <div class="flex flex-wrap gap-3 items-center text-[12px]">
        <span class="code-inline">.code-inline</span>
        <span class="kbd">⌘K</span>
        <span class="pill pill-info">.text-accent</span>
        <span class="badge mono">.mono</span>
        <span class="chip dim">.dim (muted)</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.list {
  flex: 1;
  overflow: auto;
  font-size: 8pt;
  line-height: 1.2;
  padding: 2pt;
}
.row {
  display: grid;
  grid-template-columns: 70pt 70pt 1fr;
  gap: 4pt;
  padding: 2pt 0;
}
section > h2 {
  scroll-margin-top: 72px;
}
nav a {
  text-decoration: none;
  color: var(--color-text-dim);
}
nav a:hover {
  color: var(--accent-color);
}
.vertical-range {
  writing-mode: bt-lr; /* Firefox */
  -webkit-appearance: slider-vertical; /* Chrome/Safari */
  appearance: slider-vertical;
  height: 160px;
  max-width: 32px;
}
</style>
