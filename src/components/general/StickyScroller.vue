<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

import { DownIcon } from '@/components/icons'

interface Props {
  /** Number that changes when content grows; we watch it to decide to scroll */
  trigger?: number
  /** Pixel distance from bottom considered "at bottom" (fallback when sentinel isn't intersecting) */
  bottomThreshold?: number
  /** If true, applies smooth scroll behavior while pinned */
  smooth?: boolean
  /** Scroll to bottom on mount if true (default true) */
  stickOnMount?: boolean
  /** Show jump-to-bottom button when not at bottom (default true) */
  showButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  bottomThreshold: 12,
  smooth: false,
  stickOnMount: true,
  showButton: true,
})

const containerRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLDivElement | null>(null)
const atBottom = ref(false)

let resizeObs: ResizeObserver | null = null
let interObs: IntersectionObserver | null = null

function threshold() {
  // Ensure non-negative threshold
  return Math.max(0, props.bottomThreshold)
}

function computeAtBottom(el: HTMLElement) {
  // Use ceil to avoid sub-pixel rounding issues while scrolling
  return Math.ceil(el.scrollTop + el.clientHeight) >= Math.floor(el.scrollHeight - threshold())
}

function updateAtBottom() {
  const el = containerRef.value
  if (!el) return
  atBottom.value = computeAtBottom(el)
}

function scrollToBottom(opts?: { smooth?: boolean }) {
  const el = containerRef.value
  if (!el) return
  if (opts?.smooth) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  } else {
    el.scrollTop = el.scrollHeight
  }
  // Let the sentinel event eventually flip the state, but optimistically set now
  atBottom.value = true
}

// Keep pinned when new content arrives
watch(
  () => props.trigger,
  async () => {
    if (atBottom.value) {
      await nextTick()
      scrollToBottom({ smooth: props.smooth })
    }
  },
)

onMounted(async () => {
  const el = containerRef.value
  if (!el) return

  // IntersectionObserver on a sentinel keeps at-bottom state robustly
  if ('IntersectionObserver' in window) {
    interObs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        // If the sentinel is visible within the scroller, we are at bottom
        atBottom.value = !!entry?.isIntersecting
      },
      { root: el, threshold: 0.999 }, // nearly fully visible
    )
    if (sentinelRef.value) interObs.observe(sentinelRef.value)
  }

  // Initial position
  await nextTick()
  if (props.stickOnMount) {
    scrollToBottom()
  } else {
    updateAtBottom()
  }

  // ResizeObserver handles scrollHeight changes (e.g., images/fonts)
  if ('ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => {
      if (atBottom.value) scrollToBottom({ smooth: props.smooth })
    })
    resizeObs.observe(el)
  }
})

onBeforeUnmount(() => {
  const el = containerRef.value
  if (el) {
    // no manual listeners to remove; Vue handles @scroll binding
  }
  if (resizeObs) {
    try {
      resizeObs.disconnect()
    } catch {}
    resizeObs = null
  }
  if (interObs) {
    try {
      interObs.disconnect()
    } catch {}
    interObs = null
  }
})

function onScroll() {
  // Fallback to math if sentinel isn't supported/ready
  updateAtBottom()
}

defineExpose({ scrollToBottom, atBottom })
</script>

<template>
  <div class="relative h-full min-h-0">
    <div
      ref="containerRef"
      :class="[
        'overflow-y-auto h-auto max-h-full min-h-0',
        props.smooth && atBottom ? 'scroll-smooth' : '',
      ]"
      @scroll="onScroll"
    >
      <slot />
      <!-- Sentinel used to detect bottom intersection reliably across content growth -->
      <div ref="sentinelRef" aria-hidden="true" style="height: 1px"></div>
    </div>

    <!-- Absolute overlay: pinned to bottom-right of the scroll area without affecting layout -->
    <button
      v-show="(props.showButton ?? true) && !atBottom"
      class="btn icon-btn absolute bottom-2 right-3 pointer-events-auto shadow opacity-90 transition-opacity z-10"
      title="Scroll to latest"
      aria-label="Scroll to latest"
      @click="scrollToBottom({ smooth: true })"
    >
      <DownIcon class="icon" />
    </button>
  </div>
</template>
