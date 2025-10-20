<script lang="ts">
export interface DropMenuItem {
  label: string
  action: () => void
  disabled?: boolean
}
</script>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { MenuDotsIcon } from '@/components/icons'

withDefaults(
  defineProps<{
    items?: Array<{
      label: string
      action: () => void
      disabled?: boolean
    }>
  }>(),
  {
    items: () => [],
  },
)

const emit = defineEmits<{
  (e: 'select', item: { label: string; action: () => void }): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)
const verticalPlacement = ref<'top' | 'bottom'>('bottom')
const horizontalPlacement = ref<'left' | 'right'>('right')

const MENU_OFFSET_PX = 8

const menuInlineStyle = computed(() => ({
  top: verticalPlacement.value === 'bottom' ? '100%' : 'auto',
  bottom: verticalPlacement.value === 'top' ? '100%' : 'auto',
  marginTop: verticalPlacement.value === 'bottom' ? `${MENU_OFFSET_PX}px` : '0px',
  marginBottom: verticalPlacement.value === 'top' ? `${MENU_OFFSET_PX}px` : '0px',
  left: horizontalPlacement.value === 'left' ? '0px' : 'auto',
  right: horizontalPlacement.value === 'right' ? '0px' : 'auto',
}))

function closeMenu() {
  showMenu.value = false
  verticalPlacement.value = 'bottom'
  horizontalPlacement.value = 'right'
}

function handleGlobalPointerDown(event: PointerEvent) {
  if (!containerRef.value?.contains(event.target as Node)) {
    closeMenu()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showMenu.value) {
    closeMenu()
  }
}

function handleViewportChange() {
  if (showMenu.value) {
    void adjustMenuPlacement()
  }
}

async function adjustMenuPlacement(options: { reset?: boolean } = {}) {
  const menuElement = menuRef.value
  if (!menuElement) {
    return
  }

  if (options.reset) {
    verticalPlacement.value = 'bottom'
    horizontalPlacement.value = 'right'
    await nextTick()
  }

  let rect = menuElement.getBoundingClientRect()

  if (rect.right > window.innerWidth) {
    horizontalPlacement.value = 'left'
    await nextTick()
    rect = menuElement.getBoundingClientRect()
  }

  if (rect.left < 0) {
    horizontalPlacement.value = 'right'
    await nextTick()
    rect = menuElement.getBoundingClientRect()
  }

  if (rect.bottom > window.innerHeight && window.innerHeight >= rect.height) {
    verticalPlacement.value = 'top'
    await nextTick()
    rect = menuElement.getBoundingClientRect()

    if (rect.top < 0) {
      verticalPlacement.value = 'bottom'
    }
  } else if (rect.top < 0 && window.innerHeight >= rect.height) {
    verticalPlacement.value = 'bottom'
    await nextTick()
  }
}

async function toggleMenu() {
  if (showMenu.value) {
    closeMenu()
    return
  }

  showMenu.value = true
  await nextTick()
  await adjustMenuPlacement({ reset: true })
}

function performAction(item: { label: string; action: () => void; disabled?: boolean }) {
  if (item.disabled) {
    return
  }

  item.action()
  closeMenu()
  emit('select', item)
}

watch(
  showMenu,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('pointerdown', handleGlobalPointerDown)
      document.addEventListener('keydown', handleKeydown)
      window.addEventListener('resize', handleViewportChange)
      window.addEventListener('scroll', handleViewportChange, true)
    } else {
      document.removeEventListener('pointerdown', handleGlobalPointerDown)
      document.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <div ref="containerRef" class="relative">
    <slot name="button">
      <button
        class="btn btn-sm icon-btn"
        title="Menu"
        aria-haspopup="menu"
        :aria-expanded="showMenu ? 'true' : 'false'"
        @click="toggleMenu"
        @keydown.enter.prevent="toggleMenu"
        @keydown.space.prevent="toggleMenu"
      >
        <MenuDotsIcon class="icon" size="10" />
      </button>
    </slot>

    <div
      v-if="items && showMenu"
      ref="menuRef"
      class="absolute w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10 py-1"
      :style="menuInlineStyle"
      role="menu"
    >
      <slot name="items">
        <button
          v-for="(item, index) in items"
          :key="index"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="item.disabled"
          @click="performAction(item)"
          role="menuitem"
        >
          {{ item.label }}
        </button>
      </slot>
    </div>
  </div>
</template>
