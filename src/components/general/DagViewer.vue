<template>
  <div
    class="dag-canvas"
    ref="canvasEl"
    aria-label="DAG Viewer"
    role="region"
    :style="themeInlineStyle"
  >
    <div class="stage" ref="stageEl" :style="stageTransform">
      <svg
        ref="wiresEl"
        class="wires"
        :viewBox="`0 0 ${canvasSize.w} ${canvasSize.h}`"
        :width="canvasSize.w"
        :height="canvasSize.h"
        aria-hidden="true"
      >
        <path v-for="l in links" :key="l.id" class="link strong" :d="l.d" />
      </svg>
      <div class="nodes">
        <div
          v-for="p in positions"
          :key="p.id"
          class="node"
          :class="statusClass(p.node.status)"
          :style="{ left: p.x + 'px', top: p.y + 'px', height: NODE_H + 'px' }"
          role="button"
          :aria-pressed="p.node.status === 'done'"
          tabindex="0"
          @click="onNodeClick(p.node)"
          @dblclick.prevent="onNodeDblClick(p.node)"
          @keydown.enter.prevent="onNodeClick(p.node)"
          @keydown.space.prevent="onNodeDblClick(p.node)"
        >
          <div class="title">{{ p.node.title }}</div>
          <span class="badge">{{ p.node.status.replace('-', ' ') }}</span>
        </div>
      </div>
    </div>
    <div class="legend" aria-hidden="true">
      <span><i class="dot done" />done</span>
      <span><i class="dot pending" />not-sent</span>
    </div>
    <button
      class="fit-btn"
      type="button"
      @click="fitToView"
      :disabled="allInView"
      aria-label="Fit all nodes into view"
    >
      Fit
    </button>
    <div
      v-if="showMinimapEffective"
      class="minimap"
      role="presentation"
      ref="minimapEl"
      :style="{ width: minimap.w + 'px', height: minimap.h + 'px' }"
      @pointerdown="minimapJump"
      @pointermove="onMinimapPointerMove"
      @pointerup="onMinimapPointerUp"
      @pointerleave="onMinimapPointerUp"
    >
      <svg :width="minimap.w" :height="minimap.h" class="minimap-stage">
        <g :transform="`translate(${minimap.offsetX},${minimap.offsetY}) scale(${minimap.scale})`">
          <path v-for="l in links" :key="l.id" class="mini-link" :d="l.d" />
          <rect
            v-for="p in positions"
            :key="'m-' + p.id"
            :x="p.x"
            :y="p.y"
            :width="NODE_W"
            :height="NODE_H"
            :class="['mini-node', statusClass(p.node.status)]"
            rx="4"
            ry="4"
          />
        </g>
      </svg>
      <div
        class="mini-viewport"
        :style="{
          left: viewportRect.x + 'px',
          top: viewportRect.y + 'px',
          width: viewportRect.w + 'px',
          height: viewportRect.h + 'px',
        }"
        @pointerdown.stop.prevent="onViewportDragStart"
      />
    </div>
  </div>
</template>

<script lang="ts">
export interface DagNode {
  id: string
  title: string
  status: string
  children?: DagNode[]
  childrenLeft?: DagNode[]
  childrenRight?: DagNode[]
}
export type DagRoot = DagNode

interface PositionedNode {
  id: string
  node: DagNode
  x: number
  y: number
}
interface LinkGeom {
  id: string
  from: string
  to: string
  d: string
}
interface LayoutResult {
  positions: PositionedNode[]
  links: LinkGeom[]
  size: { w: number; h: number }
}
interface LayoutConstants {
  NODE_W: number
  NODE_H: number
  GAP_X: number
  GAP_Y: number
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    model?: DagRoot
    layoutStrategy?: (root: DagRoot, constants: LayoutConstants) => LayoutResult
    asyncToggle?: boolean
    showMinimap?: boolean
    autoFitOnMount?: boolean
    minimapPadding?: number // inner padding (px) inside minimap around content (default 4)
    themeVars?: Record<string, string> // CSS variable overrides (keys become --kebab-case)
  }>(),
  {
    asyncToggle: false,
    showMinimap: true,
    autoFitOnMount: true,
  },
)

const emit = defineEmits<{
  (e: 'update:model', value: DagRoot): void
  (e: 'node-click', node: DagNode, model: DagRoot): void
  (e: 'node-dblclick', node: DagNode, model: DagRoot): void
  (e: 'node-select', node: DagNode, model: DagRoot): void
}>()

// Demo fallback data if no model provided
const fallback = reactive<DagRoot>({
  id: 'root',
  title: 'Split',
  status: 'done',
  childrenLeft: [
    { id: 'f3152000', title: 'TE', status: 'done' },
    { id: '540a0396', title: 'SG', status: 'done' },
  ],
  childrenRight: [
    { id: 'mo1', title: 'MO', status: 'not-sent' },
    { id: 'mo2', title: 'MO', status: 'not-sent' },
    { id: 'mo3', title: 'MO', status: 'not-sent' },
    { id: 'mo4', title: 'MO', status: 'not-sent' },
  ],
})

// Internal working copy if parent does not supply model
const internalModel = reactive<DagRoot>(fallback)
const model = computed(() => props.model ?? internalModel)

// Layout constants (exported for style binding)
const NODE_W = 110,
  NODE_H = 54,
  GAP_X = 120,
  GAP_Y = 26

// ----- Layout Strategies -----
function bracketLayout(m: DagRoot): LayoutResult {
  const left = m.childrenLeft ?? []
  const right = m.childrenRight ?? []
  const totalRows = Math.max(left.length, right.length, 1)
  const height = totalRows * NODE_H + (totalRows - 1) * GAP_Y
  const oy = 200
  const ox = 220
  const positions: PositionedNode[] = []
  left.forEach((n, i) => {
    const y = oy + i * (NODE_H + GAP_Y)
    positions.push({ id: n.id, node: n, x: ox - (NODE_W + GAP_X), y })
  })
  const centerIndex = Math.floor((totalRows - 1) / 2)
  const centerYpos = oy + centerIndex * (NODE_H + GAP_Y)
  positions.push({ id: m.id, node: m, x: ox, y: centerYpos })
  right.forEach((n, i) => {
    const y = oy + i * (NODE_H + GAP_Y)
    positions.push({ id: n.id, node: n, x: ox + (NODE_W + GAP_X), y })
  })
  const byId = Object.fromEntries(positions.map((p) => [p.id, p]))
  const links: LinkGeom[] = []
  ;[...left, ...right].forEach((child) => {
    const a = byId[m.id]
    const b = byId[child.id]
    if (!a || !b) return
    const ax = a.x + NODE_W,
      ay = a.y + NODE_H / 2
    const bx = b.x,
      by = b.y + NODE_H / 2
    const midX = (ax + bx) / 2
    const d = `M ${ax} ${ay} H ${midX} V ${by} H ${bx}`
    links.push({ id: `${a.id}-${b.id}`, from: a.id, to: b.id, d })
  })
  const size = { w: ox + (NODE_W + GAP_X) + 400, h: oy + height + 200 }
  return { positions, links, size }
}

function recursiveLayout(root: DagRoot): LayoutResult {
  interface QItem {
    node: DagNode
    depth: number
    parent?: DagNode
  }
  const queue: QItem[] = [{ node: root, depth: 0 }]
  const layers: DagNode[][] = []
  const parentMap = new Map<string, DagNode>()
  while (queue.length) {
    const { node, depth } = queue.shift()!
    if (!layers[depth]) layers[depth] = []
    layers[depth].push(node)
    const children: DagNode[] =
      node.childrenLeft?.length || node.childrenRight?.length
        ? [...(node.childrenLeft ?? []), ...(node.childrenRight ?? [])]
        : (node.children ?? [])
    children.forEach((ch) => {
      parentMap.set(ch.id, node)
      queue.push({ node: ch, depth: depth + 1 })
    })
  }
  const positions: PositionedNode[] = []
  const marginLeft = 120,
    marginTop = 120
  layers.forEach((layer, depth) => {
    layer.forEach((node, i) => {
      const x = marginLeft + depth * (NODE_W + GAP_X)
      const y = marginTop + i * (NODE_H + GAP_Y)
      positions.push({ id: node.id, node, x, y })
    })
  })
  const byId = Object.fromEntries(positions.map((p) => [p.id, p]))
  const links: LinkGeom[] = []
  positions.forEach((p) => {
    const parent = parentMap.get(p.id)
    if (!parent) return // root
    const a = byId[parent.id]
    const b = p
    if (!a) return
    const ax = a.x + NODE_W,
      ay = a.y + NODE_H / 2
    const bx = b.x,
      by = b.y + NODE_H / 2
    const midX = (ax + bx) / 2
    const d = `M ${ax} ${ay} H ${midX} V ${by} H ${bx}`
    links.push({ id: `${a.id}-${b.id}`, from: a.id, to: b.id, d })
  })
  const width = Math.max(...positions.map((p) => p.x)) + NODE_W + 200
  const height = Math.max(...positions.map((p) => p.y)) + NODE_H + 200
  return { positions, links, size: { w: width, h: height } }
}

function defaultLayout(m: DagRoot): LayoutResult {
  // Heuristic: if left/right arrays exist, use bracket; otherwise recursive
  if ((m.childrenLeft && m.childrenLeft.length) || (m.childrenRight && m.childrenRight.length)) {
    return bracketLayout(m)
  }
  return recursiveLayout(m)
}

const layoutResult = computed<LayoutResult>(() => {
  const strat = props.layoutStrategy
  return strat ? strat(model.value, { NODE_W, NODE_H, GAP_X, GAP_Y }) : defaultLayout(model.value)
})

const positions = computed(() => layoutResult.value.positions)
const links = computed(() => layoutResult.value.links)
const canvasSize = computed(() => layoutResult.value.size)

function onNodeClick(n: DagNode) {
  emit('node-select', n, model.value)
  emit('node-click', n, model.value) // legacy event name
  // Modifier-assisted toggle: Alt+Click toggles without needing double click or space
}

function onNodeDblClick(n: DagNode) {
  emit('node-dblclick', n, model.value)
}

function statusClass(status: string) {
  return status === 'done' ? 'done' : status === 'not-sent' ? 'pending' : ''
}

// Pan & zoom state
const canvasEl = ref<HTMLDivElement | null>(null)
const stageEl = ref<HTMLDivElement | null>(null)
const wiresEl = ref<SVGSVGElement | null>(null) // reserved if needed later

const pan = reactive({ x: 0, y: 0, scale: 1 })
const stageTransform = computed(
  () => `transform: translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`,
)

let start: { x: number; y: number } | null = null

function applyTransform() {
  // style binding handles it (kept for future imperatively if needed)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const container = canvasEl.value!
  const delta = Math.sign(e.deltaY) * 0.1
  const next = Math.min(2.0, Math.max(0.5, pan.scale - delta))
  const rect = container.getBoundingClientRect()
  const cx = e.clientX - rect.left,
    cy = e.clientY - rect.top
  pan.x = cx - (cx - pan.x) * (next / pan.scale)
  pan.y = cy - (cy - pan.y) * (next / pan.scale)
  pan.scale = next
  applyTransform()
}

function onPointerDown(e: PointerEvent) {
  start = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!start) return
  pan.x = e.clientX - start.x
  pan.y = e.clientY - start.y
  applyTransform()
}
function onPointerUp() {
  start = null
}

onMounted(() => {
  const c = canvasEl.value!
  c.addEventListener('wheel', onWheel, { passive: false })
  c.addEventListener('pointerdown', onPointerDown)
  c.addEventListener('pointermove', onPointerMove)
  c.addEventListener('pointerup', onPointerUp)
  initResizeObserver()
  if (props.autoFitOnMount !== false) {
    scheduleAutoFit()
  }
})
onUnmounted(() => {
  const c = canvasEl.value
  if (!c) return
  c.removeEventListener('wheel', onWheel)
  c.removeEventListener('pointerdown', onPointerDown)
  c.removeEventListener('pointermove', onPointerMove)
  c.removeEventListener('pointerup', onPointerUp)
  if (ro) ro.disconnect()
})

// ----- Minimap -----
interface Size {
  w: number
  h: number
}
const containerSize = reactive<Size>({ w: 0, h: 0 })
let ro: ResizeObserver | null = null
function initResizeObserver() {
  if (!canvasEl.value) return
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      containerSize.w = e.contentRect.width
      containerSize.h = e.contentRect.height
    }
  })
  ro.observe(canvasEl.value)
}

const minimap = computed(() => {
  const b = contentBounds.value
  const padding = props.minimapPadding ?? 4
  const MAX_W = 220
  const MAX_H = 160
  const contentW = Math.max(1, b.w)
  const contentH = Math.max(1, b.h)
  let scale = Math.min((MAX_W - padding * 2) / contentW, (MAX_H - padding * 2) / contentH)
  scale = Math.max(scale, 0.01)
  const drawnW = contentW * scale + padding * 2
  const drawnH = contentH * scale + padding * 2
  // offset so that original node coordinates are translated by -b.minX/minY plus padding
  const offsetX = padding - b.minX * scale
  const offsetY = padding - b.minY * scale
  return {
    w: drawnW,
    h: drawnH,
    scale,
    offsetX,
    offsetY,
    contentW: contentW * scale,
    contentH: contentH * scale,
    padding,
  }
})

// Tight content bounds around nodes
const contentBounds = computed(() => {
  const list = positions.value
  if (!list.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of list) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    const ex = p.x + NODE_W
    const ey = p.y + NODE_H
    if (ex > maxX) maxX = ex
    if (ey > maxY) maxY = ey
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
})

// Determine if content bounds fully visible
const allInView = computed(() => {
  if (!containerSize.w || !containerSize.h) return false
  const b = contentBounds.value
  if (b.w === 0 && b.h === 0) return true
  const vx = -pan.x / pan.scale
  const vy = -pan.y / pan.scale
  const vw = containerSize.w / pan.scale
  const vh = containerSize.h / pan.scale
  const eps = 0.5
  return (
    vx <= b.minX + eps && vy <= b.minY + eps && vx + vw >= b.maxX - eps && vy + vh >= b.maxY - eps
  )
})

const showMinimapEffective = computed(() => props.showMinimap !== false && !allInView.value)

// viewport rectangle inside minimap (world -> minimap coordinates)
const viewportRect = computed(() => {
  const m = minimap.value
  const b = contentBounds.value
  if (b.w === 0 && b.h === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const worldX = -pan.x / pan.scale
  const worldY = -pan.y / pan.scale
  const vw = containerSize.w / pan.scale
  const vh = containerSize.h / pan.scale
  // intersection of viewport with content bounds
  const ix1 = Math.max(worldX, b.minX)
  const iy1 = Math.max(worldY, b.minY)
  const ix2 = Math.min(worldX + vw, b.maxX)
  const iy2 = Math.min(worldY + vh, b.maxY)
  let iw = ix2 - ix1
  let ih = iy2 - iy1
  if (iw <= 0 || ih <= 0) {
    // viewport completely outside (rare) – show full content
    iw = b.w
    ih = b.h
    return { x: m.offsetX, y: m.offsetY, w: iw * m.scale, h: ih * m.scale }
  }
  // IMPORTANT: offsetX/Y already translate by -b.minX/-b.minY (offsetX = padding - b.minX*scale)
  // so we map world coordinates directly: minimapCoord = offset + worldCoord * scale
  return {
    x: m.offsetX + ix1 * m.scale,
    y: m.offsetY + iy1 * m.scale,
    w: Math.max(2, iw * m.scale),
    h: Math.max(2, ih * m.scale),
  }
})

function minimapJump(e: PointerEvent) {
  const mm = e.currentTarget as HTMLElement
  const rect = mm.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const m = minimap.value
  const b = contentBounds.value
  // Raw coordinates relative to minimap content transform
  const rawX = mx - m.offsetX
  const rawY = my - m.offsetY
  // Normalize so that 0 maps to b.minX / b.minY
  const normX = rawX - b.minX * m.scale
  const normY = rawY - b.minY * m.scale
  if (normX < 0 || normY < 0 || normX > b.w * m.scale || normY > b.h * m.scale) return
  const contentX = normX / m.scale + b.minX
  const contentY = normY / m.scale + b.minY
  // Center the main viewport on the clicked point
  const worldX = contentX - containerSize.w / pan.scale / 2
  const worldY = contentY - containerSize.h / pan.scale / 2
  pan.x = -worldX * pan.scale
  pan.y = -worldY * pan.scale
}

let draggingViewport = false
function onViewportDragStart(e: PointerEvent) {
  draggingViewport = true
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {}
}
function onMinimapPointerMove(e: PointerEvent) {
  if (draggingViewport) minimapJump(e)
}
function onMinimapPointerUp() {
  draggingViewport = false
}

const minimapEl = ref<HTMLElement | null>(null)

function fitToView() {
  if (!containerSize.w || !containerSize.h) return
  const b = contentBounds.value
  if (b.w === 0 && b.h === 0) return
  const margin = 32
  const availW = containerSize.w - margin
  const availH = containerSize.h - margin
  const scaleCand = Math.min(availW / b.w, availH / b.h)
  const newScale = Math.min(2.0, Math.max(0.1, scaleCand))
  pan.scale = newScale
  pan.x = (containerSize.w - b.w * newScale) / 2 - b.minX * newScale
  pan.y = (containerSize.h - b.h * newScale) / 2 - b.minY * newScale
}

// Theme variable mapping
function camelToKebab(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}
// Maintain internal reactive copy so even in-place mutations (if reactive upstream) reflect.
const themeVarsState = ref<Record<string, string>>({})
watch(
  () => props.themeVars,
  (nv) => {
    if (nv) {
      // shallow clone to ensure new object identity for style diffing
      themeVarsState.value = { ...nv }
    } else {
      themeVarsState.value = {}
    }
  },
  { deep: true, immediate: true },
)

const themeInlineStyle = computed(() => {
  const out: Record<string, string> = {}
  const src = themeVarsState.value
  for (const [k, v] of Object.entries(src)) {
    out['--' + camelToKebab(k)] = v
    if (k === 'bg') out['--bg'] = v
    if (k === 'ink') out['--ink'] = v
  }
  return out
})

defineExpose({ fitToView })

// ---- Stability-based deferred auto-fit ----
const autoFitDone = ref(false)
let autoFitLoopActive = false
function scheduleAutoFit() {
  if (autoFitDone.value || autoFitLoopActive || props.autoFitOnMount === false) return
  autoFitLoopActive = true
  let lastW = 0
  let lastH = 0
  let stableFrames = 0
  const requiredStable = 1 // require N consecutive stable frames
  const maxFrames = 16 // safety cap
  let frame = 0
  const tick = () => {
    const cw = containerSize.w
    const ch = containerSize.h
    const b = contentBounds.value
    if (cw > 0 && ch > 0 && b.w > 0 && b.h > 0) {
      if (b.w === lastW && b.h === lastH) {
        stableFrames++
      } else {
        stableFrames = 0
        lastW = b.w
        lastH = b.h
      }
      if (stableFrames >= requiredStable || frame >= maxFrames) {
        fitToView()
        autoFitDone.value = true
        autoFitLoopActive = false
        return
      }
    }
    frame++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// Re-schedule (if not yet done) when container size or layout changes
watch(
  [
    () => containerSize.w,
    () => containerSize.h,
    () => contentBounds.value.w,
    () => contentBounds.value.h,
  ],
  () => {
    if (!autoFitDone.value) scheduleAutoFit()
  },
  { flush: 'post' },
)
</script>

<style scoped>
.dag-canvas {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  user-select: none;
  background: var(--bg, #242629);
  color: var(--ink, #e5e7eb);
  font:
    14px/1.3 ui-sans-serif,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto;
}
.stage {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}
.nodes {
  position: absolute;
  inset: 0;
}
.wires {
  position: absolute;
  inset: 0;
}
.node {
  position: absolute;
  width: 110px;
  padding: 8px 10px 6px;
  border-radius: var(--radius, 10px);
  background: var(--chip-bg, #2b2e33);
  color: var(--ink, #e5e7eb);
  box-shadow: 0 0 0 2px #ffffff20 inset;
}
.node .title {
  font-weight: 600;
  margin-bottom: 4px;
}
.node .badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--radius-lg);
  font-size: 12px;
  line-height: 1;
  background: #00000030;
  color: var(--muted, #b6b8bf);
}
.node.done {
  background: linear-gradient(#7cc072, #65a95e);
  color: var(--done-ink, #101113);
}
.node.done .badge {
  background: #00000025;
  color: #e6f2e4;
}
.node.pending {
  background: linear-gradient(#db6e73, #c55c61);
  color: var(--pending-ink, #121214);
}
.node.pending .badge {
  background: #00000025;
  color: #ffe9eb;
}
.link {
  stroke: var(--line, #aeb2c31a);
  stroke-width: 2;
  fill: none;
}
.link.strong {
  stroke: var(--line-strong, #aeb2c355);
}
.node:hover {
  outline: 2px solid #ffffff35;
  cursor: pointer;
}
.legend {
  position: absolute;
  right: 12px;
  top: 12px;
  background: #00000030;
  border-radius: var(--radius-xl);
  padding: 6px 10px;
  backdrop-filter: blur(6px);
  font-size: 12px;
  display: flex;
  gap: 10px;
}
.legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: -1px;
}
.dot.done {
  background: var(--done, #74b56a);
}
.dot.pending {
  background: var(--pending, #d1656a);
}
/* fit button */
.fit-btn {
  position: absolute;
  left: 12px;
  top: 12px;
  background: #00000040;
  color: #fff;
  border: 1px solid #ffffff30;
  border-radius: var(--radius-lg);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(2px);
  transition:
    background 0.15s,
    border-color 0.15s;
}
.fit-btn:hover:not(:disabled) {
  background: #00000055;
}
.fit-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
/* minimap */
.minimap {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: #00000040;
  backdrop-filter: blur(4px);
  border: 1px solid #ffffff20;
  border-radius: var(--radius-xl);
  padding: 6px;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.minimap-stage {
  display: block;
}
.mini-link {
  stroke: #ffffff30;
  stroke-width: 1;
  fill: none;
}
.mini-node {
  fill: #3a3d42;
  stroke: #ffffff25;
  stroke-width: 1;
}
.mini-node.done {
  fill: #65a95e;
}
.mini-node.pending {
  fill: #c55c61;
}
.mini-viewport {
  position: absolute;
  border: 2px solid #ffffffaa;
  background: #ffffff20;
  box-shadow: 0 0 0 1px #00000040 inset;
  border-radius: var(--radius-sm);
  cursor: grab;
}
.mini-viewport:active {
  cursor: grabbing;
}
</style>
