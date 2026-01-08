<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  size?: 'default' | 'sm'
  vertical?: boolean
  showBubble?: boolean
  disabled?: boolean
  height?: number | string
  trackThickness?: number
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  size: 'default',
  vertical: false,
  showBubble: false,
  disabled: false,
  height: 160,
  trackThickness: 4,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const pct = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return ((props.modelValue - props.min) / span) * 100
})

const fillStyle = computed(() => {
  return props.vertical
    ? { height: pct.value + '%', width: '100%', bottom: 0 }
    : { width: pct.value + '%', height: '100%' }
})

const bubbleStyle = computed(() => {
  const thumbOffset = 7 - pct.value * 0.14
  if (props.vertical) {
    const bubbleHalfHeight = 10
    return {
      bottom: `calc(${pct.value}% + ${thumbOffset - bubbleHalfHeight}px)`,
      transform: 'translateX(-90%)',
    }
  }
  return {
    left: `calc(${pct.value}% + ${thumbOffset}px)`,
    transform: 'translateX(-50%) translateY(-50%)',
  }
})

const rootStyle = computed(() => ({
  '--rslider-track-thickness': props.trackThickness + 'px',
  ...(props.vertical
    ? { height: typeof props.height === 'number' ? props.height + 'px' : props.height }
    : {}),
}))

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  const val = Number(target.value)
  emit('update:modelValue', val)
}
</script>

<template>
  <div
    class="rslider"
    :class="[
      vertical ? 'rslider-vertical' : 'rslider-horizontal',
      size !== 'default' ? `rslider-${size}` : '',
      disabled ? 'rslider-disabled' : '',
    ]"
    :style="rootStyle"
  >
    <div class="rslider-track" aria-hidden="true">
      <div class="rslider-fill" :style="fillStyle"></div>
    </div>
    <input
      ref="inputRef"
      class="rslider-native"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      @input="onInput"
      @change="emit('change', modelValue)"
    />
    <div v-if="showBubble" class="rslider-bubble font-mono" :style="bubbleStyle">
      {{ modelValue }}
    </div>
  </div>
</template>

<style scoped>
.rslider {
  position: relative;
  display: inline-flex;
  user-select: none;
  touch-action: none;
  --rslider-thumb-size: 14px;
  --rslider-track-thickness: 4px;
  font-size: 12px;
}
.rslider-horizontal {
  width: 100%;
  height: 1.6rem;
}
.rslider-vertical {
  width: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rslider-track {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 100%;
  height: var(--rslider-track-thickness);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--border-color) 55%, transparent);
  overflow: hidden;
}
.rslider-vertical .rslider-track {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: var(--rslider-track-thickness);
  height: 100%;
}
.rslider-fill {
  position: absolute;
  left: 0;
  top: 0;
  background: color-mix(in srgb, var(--accent-color) 70%, transparent);
  pointer-events: none;
}
.rslider-vertical .rslider-fill {
  bottom: 0;
  top: auto;
}
.rslider-native {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}
.rslider-vertical .rslider-native {
  writing-mode: vertical-lr;
  direction: rtl;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 100%;
}
/* Track hidden (we draw custom) */
.rslider-native::-webkit-slider-runnable-track {
  background: transparent;
  height: var(--rslider-track-thickness);
}
.rslider-native::-moz-range-track {
  background: transparent;
  height: var(--rslider-track-thickness);
}

/* Thumb */
.rslider-native::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: var(--rslider-thumb-size);
  width: var(--rslider-thumb-size);
  border-radius: 50%;
  background: var(--panel-header-bg);
  border: 1px solid var(--border-color);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(0, 0, 0, 0.4);
  transition:
    background 0.15s,
    transform 0.15s,
    border-color 0.2s;
  position: relative;
}
.rslider-native::-moz-range-thumb {
  height: var(--rslider-thumb-size);
  width: var(--rslider-thumb-size);
  border-radius: 50%;
  background: var(--panel-header-bg);
  border: 1px solid var(--border-color);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(0, 0, 0, 0.4);
  transition:
    background 0.15s,
    transform 0.15s,
    border-color 0.2s;
}
.rslider-native:hover::-webkit-slider-thumb,
.rslider-native:hover::-moz-range-thumb {
  background: color-mix(in srgb, var(--panel-header-bg) 80%, transparent);
}
.rslider-native:active::-webkit-slider-thumb,
.rslider-native:active::-moz-range-thumb {
  transform: scale(0.92);
  background: color-mix(in srgb, var(--accent-color) 30%, transparent);
  border-color: var(--accent-color);
}
.rslider-native:focus-visible {
  outline: none;
}
.rslider-native:focus-visible::-webkit-slider-thumb,
.rslider-native:focus-visible::-moz-range-thumb {
  border-color: var(--accent-color);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent-color) 40%, transparent),
    0 0 0 1px var(--accent-color);
}
.rslider-disabled .rslider-native {
  cursor: not-allowed;
}
.rslider-disabled .rslider-native::-webkit-slider-thumb,
.rslider-disabled .rslider-native::-moz-range-thumb {
  background: color-mix(in srgb, var(--panel-header-bg) 40%, transparent);
  border-color: color-mix(in srgb, var(--border-color) 60%, transparent);
  box-shadow: none;
}
/* Size modifier */
.rslider-sm {
  --rslider-thumb-size: 12px;
}
.rslider-sm.rslider-horizontal {
  height: 1.2rem;
}
.rslider-sm .rslider-track {
  height: 3px;
}

/* Bubble */
.rslider-bubble {
  position: absolute;
  top: -4px;
  transform: translate(-50%, -100%);
  background: var(--panel-header-bg);
  border: 1px solid var(--border-color);
  color: var(--color-text-dim);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-md);
  pointer-events: none;
  line-height: 1.2;
  white-space: nowrap;
}
.rslider-vertical .rslider-bubble {
  left: calc(100% + 8px);
  top: auto;
  bottom: 0;
  transform: none;
}
.rslider-bubble::after {
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
.rslider-vertical .rslider-bubble::after {
  left: 0;
  top: 50%;
  transform: translate(-50%, -50%) rotate(135deg);
}
</style>
