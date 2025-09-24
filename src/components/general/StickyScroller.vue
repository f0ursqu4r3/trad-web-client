<script setup lang="ts">
import { ref, watch, nextTick, onMounted, defineProps, defineExpose } from 'vue'

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

const props = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
const atBottom = ref(true)

const threshold = () => props.bottomThreshold ?? 12

function computeAtBottom(el: HTMLElement) {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold()
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
  if (props.stickOnMount !== false) {
    nextTick().then(() => {
      updateAtBottom()
      if (atBottom.value) scrollToBottom()
    })
  } else {
    updateAtBottom()
  }
})

function onScroll() {
  updateAtBottom()
}

defineExpose({ scrollToBottom, atBottom })
</script>

<template>
  <div
    ref="containerRef"
    class="sticky-scroller"
    :class="{
      'is-pinned': atBottom,
      'has-button': (props.showButton ?? true) && !atBottom,
      'smooth-active': props.smooth && atBottom,
    }"
    @scroll="onScroll"
  >
    <slot />
    <div
      v-if="(props.showButton ?? true) && !atBottom"
      class="button scroll-button"
      title="Scroll to latest"
      @click="scrollToBottom({ smooth: true })"
    >
      <DownIcon class="icon" />
      <span class="sr-only">Scroll to latest</span>
    </div>
  </div>
</template>

<style scoped>
.sticky-scroller {
  position: relative;
  overflow-y: auto;
  height: 100%;
  scrollbar-width: thin;
}
.sticky-scroller.smooth-active {
  scroll-behavior: smooth;
}
.scroll-button {
  position: sticky;
  left: 100%;
  margin-left: -1rem;
  bottom: 0.25rem;
  transform: translateX(-0.25rem);
  box-shadow: 0 2px 4px #0006;
  opacity: 0.85;
  transition: opacity 0.15s;
  z-index: 10;
}
.scroll-button:hover {
  opacity: 1;
}
.scroll-button .icon {
  display: block;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
