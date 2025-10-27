<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

import { DownIcon } from '@/components/icons'

interface Props {
  /** Number that changes when content grows; we watch it to decide to scroll */
  trigger?: number
  /** Pixel distance from bottom considered "at bottom" */
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
const atBottom = ref(false)
let resizeObs: ResizeObserver | null = null
let mutationObs: MutationObserver | null = null

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

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  // Initial position
  if (props.stickOnMount) {
    scrollToBottom()
  } else {
    updateAtBottom()
  }

  // Observe size/content changes automatically when trigger is not provided
  if (typeof props.trigger === 'undefined') {
    // ResizeObserver handles scrollHeight changes (e.g., images loading)
    if ('ResizeObserver' in window) {
      resizeObs = new ResizeObserver(() => {
        if (atBottom.value) scrollToBottom({ smooth: props.smooth })
      })
      resizeObs.observe(el)
    }

    // MutationObserver watches child additions (new messages, etc.)
    if ('MutationObserver' in window) {
      mutationObs = new MutationObserver(() => {
        if (atBottom.value) scrollToBottom({ smooth: props.smooth })
      })
      mutationObs.observe(el, { childList: true, subtree: true })
    }
  }

  // Keep atBottom state fresh on resize & scroll
  const onScroll = () => updateAtBottom()
  const onResize = () => updateAtBottom()
  el.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)

  // Cleanup
  onBeforeUnmount(() => {
    el.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    if (resizeObs) {
      try {
        resizeObs.disconnect()
      } catch {}
      resizeObs = null
    }
    if (mutationObs) {
      try {
        mutationObs.disconnect()
      } catch {}
      mutationObs = null
    }
  })
})

function onScroll() {
  updateAtBottom()
}

defineExpose({ scrollToBottom, atBottom })
</script>

<template>
  <div
    ref="containerRef"
    :class="[
      'relative overflow-y-auto h-auto max-h-full min-h-0 pb-8',
      props.smooth && atBottom ? 'scroll-smooth' : '',
    ]"
    style="scrollbar-gutter: stable; scrollbar-width: thin"
    @scroll="onScroll"
  >
    <slot />
    <button
      v-show="(props.showButton ?? true) && !atBottom"
      class="btn icon-btn sticky left-full -ml-4 bottom-1 -translate-x-1 shadow opacity-90 transition-opacity z-10"
      title="Scroll to latest"
      aria-label="Scroll to latest"
      @click="scrollToBottom({ smooth: true })"
    >
      <DownIcon class="icon" />
    </button>
  </div>
</template>
