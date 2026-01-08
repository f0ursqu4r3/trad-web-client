<template>
  <div
    ref="rootEl"
    class="sv-wrapper"
    :data-orientation="props.orientation"
    :data-dragging="dragging ? 'true' : null"
    :style="gridStyle"
  >
    <!-- Default-mode: render a single pane with default slot -->
    <template v-if="isDefaultMode">
      <div class="sv-pane">
        <div class="sv-slot"><slot /></div>
      </div>
    </template>
    <!-- Named panes mode: render named slots in order -->
    <template v-else>
      <template v-for="(name, i) in namedPaneNames" :key="name">
        <div class="sv-pane">
          <div class="sv-slot"><slot :name="name" /></div>
        </div>
        <div
          v-if="i < namedPaneNames.length - 1"
          class="sv-gutter"
          role="separator"
          tabindex="0"
          :aria-orientation="props.orientation"
          @pointerdown="onGutterPointerDown(i, $event)"
          @dblclick="resetSizes"
        />
      </template>
    </template>
    <div v-if="paneCount === 0" class="sv-empty">
      <slot>
        <div class="sv-empty-fallback">No panes provided</div>
      </slot>
    </div>
  </div>
  <!-- Optional debug overlay -->
  <!-- <pre class="sv-debug">{{ sizes.join('% | ') }}</pre> -->
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, useSlots } from 'vue'

/**
 * SplitView
 * - Themeable, resizable layout with N panes.
 * - Provide any number (N) of named slots with ANY names, e.g., `#left`, `#orders`, `#foo`.
 * - Panes render in the order they are defined in the parent template (no enforced naming or sorting).
 * - Drag gutters to resize neighboring panes; sizes persist to localStorage when `storageKey` is set.
 *
 * Props
 *  - orientation: 'horizontal' | 'vertical' (default: 'horizontal')
 *  - storageKey?: string (persist sizes as percentages)
 *  - minPanePercent?: number (min size per pane as % of container, default 5)
 *  - initialSizes?: number[] (percentages summing to ~100; used if no storage value)
 *
 * Emits
 *  - resize: number[] (current sizes in % whenever drag finishes or reset occurs)
 *
 * Theming (override via CSS variables on a parent or :root)
 *  --sv-border: var(--border-color)
 *  --sv-gutter: color of gutter (default derived from border)
 *  --sv-gutter-hover
 *  --sv-gutter-active
 *  --sv-gutter-size: thickness in px (default 6px)
 */

interface Props {
  orientation?: 'horizontal' | 'vertical'
  storageKey?: string
  minPanePercent?: number
  initialSizes?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'horizontal',
  minPanePercent: 5,
})

const emit = defineEmits<{ (e: 'resize', sizes: number[]): void }>()

const rootEl = ref<HTMLElement | null>(null)
const slots = useSlots()
const dragging = ref(false)

// Determine pane strategy: named slots or single default slot
// Collect only named slots (exclude default) and sort by the order they are defined
// in the template.
const namedPaneNames = computed(() => Object.keys(slots || {}).filter((k) => k !== 'default'))
const isDefaultMode = computed(() => namedPaneNames.value.length === 0 && !!slots.default)
const paneCount = computed(() => (isDefaultMode.value ? 1 : namedPaneNames.value.length))

// Sizes as percentages for each pane (summing ~100)
const sizes = ref<number[]>([])

function normalizeSizes(nums: number[], count: number): number[] {
  if (!count) return []
  const arr = nums.slice(0, count)
  if (arr.length < count) {
    const remaining = count - arr.length
    const equal = (100 - sum(arr)) / remaining
    for (let i = 0; i < remaining; i++) arr.push(equal)
  }
  // normalize to 100
  const total = sum(arr)
  return arr.map((v) => (total > 0 ? (v / total) * 100 : 100 / count))
}

function sum(a: number[]) {
  return a.reduce((acc, n) => acc + (isFinite(n) ? n : 0), 0)
}

type StoredSizes = { sizes: number[]; names?: string[] }

function loadSizes(): StoredSizes | null {
  if (!props.storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`SplitView:${props.storageKey}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Back-compat: legacy array-only format
    if (Array.isArray(parsed)) {
      const legacy = parsed.filter((n) => typeof n === 'number') as number[]
      return { sizes: legacy }
    }
    if (
      parsed &&
      Array.isArray(parsed.sizes) &&
      parsed.sizes.every((n: unknown) => typeof n === 'number')
    ) {
      const names = Array.isArray(parsed.names)
        ? (parsed.names.filter((s: unknown) => typeof s === 'string') as string[])
        : undefined
      return { sizes: parsed.sizes as number[], names }
    }
    return null
  } catch {
    return null
  }
}

function saveSizes() {
  if (!props.storageKey || typeof window === 'undefined') return
  try {
    const payload: StoredSizes = { sizes: sizes.value.slice(), names: namedPaneNames.value.slice() }
    window.localStorage.setItem(`SplitView:${props.storageKey}`, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function initSizes() {
  const count = paneCount.value
  if (!count) {
    sizes.value = []
    return
  }
  const fromStore = loadSizes()
  if (fromStore && fromStore.sizes && fromStore.sizes.length) {
    // If names are provided, align sizes to current order by slot name
    if (fromStore.names && fromStore.names.length) {
      const map = new Map<string, number>()
      fromStore.names.forEach((n, i) => map.set(n, fromStore.sizes[i] ?? 0))
      const aligned = namedPaneNames.value.map((n) => map.get(n) ?? 0)
      sizes.value = normalizeSizes(aligned, count)
    } else {
      sizes.value = normalizeSizes(fromStore.sizes, count)
    }
    return
  }
  if (props.initialSizes && props.initialSizes.length) {
    sizes.value = normalizeSizes(props.initialSizes, count)
    return
  }
  // equal split
  const each = 100 / count
  sizes.value = Array(count).fill(each)
}

watch(paneCount, () => {
  // pane count changed: re-normalize sizes while keeping as much as possible
  sizes.value = normalizeSizes(sizes.value, paneCount.value)
  queueMicrotask(saveSizes)
})

onMounted(() => {
  initSizes()
})

// Grid style based on orientation and sizes
const gridStyle = computed(() => {
  const gsz = 'var(--sv-gutter-size, 6px)'
  if (!paneCount.value) return {}
  const tracks: string[] = []
  sizes.value.forEach((pct, idx) => {
    tracks.push(`${pct}%`)
    if (idx < sizes.value.length - 1) tracks.push(gsz)
  })
  if (props.orientation === 'vertical') {
    return { gridTemplateRows: tracks.join(' '), gridTemplateColumns: '1fr' }
  }
  return { gridTemplateColumns: tracks.join(' '), gridTemplateRows: '1fr' }
})

// Drag/resize
let dragIndex = -1
let startPos = 0
let startA = 0
let startB = 0

// Global UX helpers during drag: disable text selection and show resize cursor
let prevBodyUserSelect: string | null = null
let prevBodyWebkitUserSelect: string | null = null
let prevBodyMsUserSelect: string | null = null
let prevDocCursor: string | null = null

function setGlobalDragUx(active: boolean) {
  if (typeof document === 'undefined') return
  const bodyStyle = document.body?.style
  const docStyle = document.documentElement?.style
  if (active) {
    if (prevBodyUserSelect == null)
      prevBodyUserSelect = bodyStyle.getPropertyValue('user-select') || ''
    if (prevBodyWebkitUserSelect == null)
      prevBodyWebkitUserSelect = bodyStyle.getPropertyValue('-webkit-user-select') || ''
    if (prevBodyMsUserSelect == null)
      prevBodyMsUserSelect = bodyStyle.getPropertyValue('-ms-user-select') || ''
    if (prevDocCursor == null) prevDocCursor = docStyle?.cursor || ''
    bodyStyle.setProperty('user-select', 'none')
    bodyStyle.setProperty('-webkit-user-select', 'none')
    bodyStyle.setProperty('-ms-user-select', 'none')
    if (docStyle) docStyle.cursor = props.orientation === 'vertical' ? 'row-resize' : 'col-resize'
  } else {
    if (prevBodyUserSelect != null) bodyStyle.setProperty('user-select', prevBodyUserSelect)
    if (prevBodyWebkitUserSelect != null)
      bodyStyle.setProperty('-webkit-user-select', prevBodyWebkitUserSelect)
    if (prevBodyMsUserSelect != null) bodyStyle.setProperty('-ms-user-select', prevBodyMsUserSelect)
    if (docStyle && prevDocCursor != null) docStyle.cursor = prevDocCursor
    prevBodyUserSelect = prevBodyWebkitUserSelect = prevBodyMsUserSelect = prevDocCursor = null
  }
}

function onGutterPointerDown(index: number, e: PointerEvent) {
  if (!rootEl.value) return
  dragIndex = index
  startPos = props.orientation === 'vertical' ? e.clientY : e.clientX
  startA = sizes.value[index]
  startB = sizes.value[index + 1]
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  dragging.value = true
  setGlobalDragUx(true)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!rootEl.value || dragIndex < 0) return
  const rect = rootEl.value.getBoundingClientRect()
  const totalPx = props.orientation === 'vertical' ? rect.height : rect.width
  const deltaPx = (props.orientation === 'vertical' ? e.clientY : e.clientX) - startPos
  const deltaPct = (deltaPx / Math.max(totalPx, 1)) * 100
  const min = props.minPanePercent
  let a = startA + deltaPct
  let b = startB - deltaPct
  if (a < min) {
    b -= min - a
    a = min
  }
  if (b < min) {
    a -= min - b
    b = min
  }
  // Prevent negatives beyond constraints
  a = Math.max(min, a)
  b = Math.max(min, b)

  const next = sizes.value.slice()
  next[dragIndex] = a
  next[dragIndex + 1] = b
  // Re-normalize the pair to maintain original pair sum (startA + startB)
  const pairSum = startA + startB
  const abSum = a + b
  if (abSum > 0) {
    const scale = pairSum / abSum
    next[dragIndex] = a * scale
    next[dragIndex + 1] = b * scale
  }
  sizes.value = next
}

function onPointerUp() {
  if (dragIndex < 0) return
  dragIndex = -1
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  dragging.value = false
  setGlobalDragUx(false)
  // Normalize tiny rounding and persist
  const total = sum(sizes.value)
  if (total > 0) sizes.value = sizes.value.map((v) => (v / total) * 100)
  saveSizes()
  emit('resize', sizes.value.slice())
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  dragging.value = false
  // Ensure we restore any global UX changes if unmounted mid-drag
  setGlobalDragUx(false)
})

function resetSizes() {
  if (!paneCount.value) return
  const each = 100 / paneCount.value
  sizes.value = Array(paneCount.value).fill(each)
  saveSizes()
  emit('resize', sizes.value.slice())
}
</script>

<style scoped>
.sv-wrapper {
  /* Resolve against global theme tokens (defined in assets/main.css) with safe fallbacks */
  --sv-border: var(--border-color, #2a3139);
  --sv-gutter: color-mix(in srgb, var(--sv-border, #2a3139) 75%, transparent);
  --sv-gutter-hover: color-mix(in srgb, var(--sv-border, #2a3139) 90%, transparent);
  --sv-gutter-active: var(--accent-color, #2f81f7);
  --sv-gutter-size: 2px;

  width: 100%;
  height: 100%;
  display: grid;
  border-radius: 0;
  overflow: hidden;
  min-height: 40px;
}

.sv-pane {
  display: flex;
  min-width: 0; /* allow flex/grid children to shrink */
  min-height: 0;
  overflow: hidden; /* let inner content decide scrolling */
}

/* Slot wrapper fills the pane and lets inner content manage its own layout */
.sv-slot {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
}

/* Gutter */
.sv-gutter {
  background: var(--sv-gutter);
  transition: background-color 0.15s ease;
  position: relative;
  outline: 1px solid color-mix(in srgb, var(--sv-border, #2a3139) 65%, transparent);
}
.sv-gutter:hover {
  background: var(--sv-gutter-hover);
}
.sv-gutter:active {
  background: var(--sv-gutter-active);
}

/* Hit area & handle indicator */
.sv-gutter::after {
  content: '';
  position: absolute;
  inset: 0;
  background: transparent;
}

/* Orientation-specific sizing */
.sv-wrapper[data-orientation='horizontal'] .sv-gutter {
  cursor: col-resize;
  width: var(--sv-gutter-size);
  height: 100%;
}
.sv-wrapper[data-orientation='vertical'] .sv-gutter {
  cursor: row-resize;
  width: 100%;
  height: var(--sv-gutter-size);
}

/* While dragging, prevent iframes from capturing pointer events */
.sv-wrapper[data-dragging='true'] .sv-pane iframe {
  pointer-events: none !important;
}

/* Empty state */
.sv-empty {
  display: grid;
  place-items: center;
  color: var(--color-text-dim, #8b949e);
}
.sv-empty-fallback {
  opacity: 0.8;
  font-size: 12px;
}

/* Optional debug styles */
.sv-debug {
  margin-top: 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--color-text-dim, #8b949e);
}
</style>
