<template>
  <div
    class="dualr"
    :class="[size !== 'default' ? 'dualr-' + size : '', disabled ? 'dualr-disabled' : '']"
    :style="rootStyle"
    ref="rootRef"
    role="group"
    aria-label="Dual range slider"
  >
    <div class="dualr-track" @pointerdown="onTrackPointerDown">
      <div class="dualr-range" :style="activeStyle"></div>
      <button
        ref="thumbMinRef"
        class="dualr-thumb"
        type="button"
        :style="minThumbStyle"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="localMin"
        aria-label="Minimum value"
        role="slider"
        :tabindex="disabled ? -1 : 0"
        @pointerdown.prevent="startDrag('min', $event)"
        @keydown.prevent="onThumbKey('min', $event)"
      ></button>
      <button
        ref="thumbMaxRef"
        class="dualr-thumb"
        type="button"
        :style="maxThumbStyle"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="localMax"
        aria-label="Maximum value"
        role="slider"
        :tabindex="disabled ? -1 : 0"
        @pointerdown.prevent="startDrag('max', $event)"
        @keydown.prevent="onThumbKey('max', $event)"
      ></button>
      <div
        v-if="showBubbles"
        class="dualr-bubble dualr-bubble-min font-mono"
        :style="minBubbleStyle"
      >
        {{ Math.round(localMin) }}
      </div>
      <div
        v-if="showBubbles"
        class="dualr-bubble dualr-bubble-max font-mono"
        :style="maxBubbleStyle"
      >
        {{ Math.round(localMax) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'

interface Props {
  minValue: number
  maxValue: number
  min?: number
  max?: number
  step?: number
  minDistance?: number
  disabled?: boolean
  size?: 'default' | 'sm'
  showBubbles?: boolean
  trackThickness?: number
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  minDistance: 0,
  disabled: false,
  size: 'default',
  showBubbles: true,
  trackThickness: 4,
})

const emit = defineEmits<{
  (e: 'update:minValue', value: number): void
  (e: 'update:maxValue', value: number): void
  (e: 'change', payload: { min: number; max: number }): void
}>()

const localMin = ref(props.minValue)
const localMax = ref(props.maxValue)
const rootRef = ref<HTMLElement | null>(null)
const thumbMinRef = ref<HTMLElement | null>(null)
const thumbMaxRef = ref<HTMLElement | null>(null)

watch(
  () => props.minValue,
  (v) => {
    if (v !== localMin.value) localMin.value = v
  },
)
watch(
  () => props.maxValue,
  (v) => {
    if (v !== localMax.value) localMax.value = v
  },
)

function clampValues() {
  if (localMin.value > localMax.value) {
    if (lastChanged.value === 'min') localMax.value = localMin.value
    else localMin.value = localMax.value
  }
  if (props.minDistance > 0 && localMax.value - localMin.value < props.minDistance) {
    if (lastChanged.value === 'min') localMax.value = localMin.value + props.minDistance
    else localMin.value = localMax.value - props.minDistance
  }
  localMin.value = Math.min(Math.max(localMin.value, props.min), props.max)
  localMax.value = Math.min(Math.max(localMax.value, props.min), props.max)
}

const lastChanged = ref<'min' | 'max'>('min')
function commit() {
  emit('update:minValue', localMin.value)
  emit('update:maxValue', localMax.value)
  emit('change', { min: localMin.value, max: localMax.value })
}

type Active = 'min' | 'max' | null
let active: Active = null
let dragRect: DOMRect | null = null

function valueToPercent(v: number) {
  const span = props.max - props.min
  if (span <= 0) return 0
  return (v - props.min) / span
}
function percentToValue(p: number) {
  const span = props.max - props.min
  return props.min + span * p
}

function startDrag(which: Active, e: PointerEvent) {
  if (props.disabled) return
  active = which
  lastChanged.value = which as 'min' | 'max'
  dragRect = rootRef.value?.getBoundingClientRect() || null
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}
function onMove(e: PointerEvent) {
  if (!active || !dragRect) return
  const x = e.clientX - dragRect.left
  const p = Math.min(Math.max(x / dragRect.width, 0), 1)
  const rawVal = percentToValue(p)
  const stepped = props.step > 0 ? Math.round(rawVal / props.step) * props.step : rawVal
  if (active === 'min') localMin.value = Math.min(stepped, localMax.value)
  else localMax.value = Math.max(stepped, localMin.value)
  clampValues()
  commit()
}
function onUp() {
  active = null
  dragRect = null
  window.removeEventListener('pointermove', onMove)
}
function onTrackPointerDown(e: PointerEvent) {
  if (props.disabled) return
  dragRect = rootRef.value?.getBoundingClientRect() || null
  if (!dragRect) return
  const x = e.clientX - dragRect.left
  const p = Math.min(Math.max(x / dragRect.width, 0), 1)
  const val = percentToValue(p)
  const distMin = Math.abs(val - localMin.value)
  const distMax = Math.abs(val - localMax.value)
  if (distMin < distMax) {
    active = 'min'
    lastChanged.value = 'min'
    localMin.value = val
  } else {
    active = 'max'
    lastChanged.value = 'max'
    localMax.value = val
  }
  clampValues()
  commit()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}
function onThumbKey(which: 'min' | 'max', e: KeyboardEvent) {
  if (props.disabled) return
  const delta = ((): number => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        return -props.step
      case 'ArrowRight':
      case 'ArrowUp':
        return props.step
      case 'PageDown':
        return -props.step * 10
      case 'PageUp':
        return props.step * 10
      case 'Home':
        return which === 'min' ? props.min - localMin.value : 0
      case 'End':
        return which === 'max' ? props.max - localMax.value : 0
      default:
        return 0
    }
  })()
  if (!delta) return
  lastChanged.value = which
  if (which === 'min') localMin.value += delta
  else localMax.value += delta
  clampValues()
  commit()
}

const span = computed(() => props.max - props.min)
const pctMin = computed(() => (span.value <= 0 ? 0 : valueToPercent(localMin.value)))
const pctMax = computed(() => (span.value <= 0 ? 0 : valueToPercent(localMax.value)))
const activeStyle = computed(() => ({
  left: pctMin.value * 100 + '%',
  width: (pctMax.value - pctMin.value) * 100 + '%',
}))
const minThumbStyle = computed(() => ({ left: pctMin.value * 100 + '%' }))
const maxThumbStyle = computed(() => ({ left: pctMax.value * 100 + '%' }))
const minBubbleStyle = computed(() => ({ left: pctMin.value * 100 + '%' }))
const maxBubbleStyle = computed(() => ({ left: pctMax.value * 100 + '%' }))
const rootStyle = computed(() => ({ '--dualr-track-thickness': props.trackThickness + 'px' }))

onMounted(() => {})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<style scoped>
.dualr {
  position: relative;
  width: 100%;
  height: 1.6rem;
  --dualr-thumb-size: 14px;
  --dualr-track-thickness: 4px;
}
.dualr-track {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 100%;
  height: var(--dualr-track-thickness);
  background: color-mix(in srgb, var(--border-color) 55%, transparent);
  border-radius: 2px;
  overflow: hidden;
}
.dualr-range {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent-color) 70%, transparent);
  pointer-events: none;
}
/* Custom thumbs */
.dualr-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: var(--dualr-thumb-size);
  height: var(--dualr-thumb-size);
  border-radius: 50%;
  background: var(--panel-header-bg);
  border: 1px solid var(--border-color);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(0, 0, 0, 0.4);
  cursor: grab;
  transition:
    background 0.15s,
    transform 0.15s,
    border-color 0.2s;
}
.dualr-thumb:active {
  cursor: grabbing;
}
.dualr-thumb:hover {
  background: color-mix(in srgb, var(--panel-header-bg) 80%, transparent);
}
.dualr-thumb:focus-visible {
  outline: none;
  border-color: var(--accent-color);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent-color) 40%, transparent),
    0 0 0 1px var(--accent-color);
}
.dualr-disabled .dualr-thumb {
  cursor: not-allowed;
  opacity: 0.6;
}
.dualr-sm {
  --dualr-thumb-size: 12px;
  height: 1.2rem;
}

.dualr-bubble {
  position: absolute;
  top: -4px;
  transform: translate(-50%, -100%);
  background: var(--panel-header-bg);
  border: 1px solid var(--border-color);
  color: var(--color-text-dim);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  line-height: 1.2;
  white-space: nowrap;
}
.dualr-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translate(-50%, -40%) rotate(45deg);
  width: 6px;
  height: 6px;
  background: inherit;
  border: 1px solid var(--border-color);
  border-left: 0;
  border-top: 0;
}
</style>
