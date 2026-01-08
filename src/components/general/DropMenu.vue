<script lang="ts">
export interface DropMenuItem {
  label: string
  action?: () => void
  disabled?: boolean
  value?: string | number
  selected?: boolean
  className?: string
  style?: string | Record<string, string>
}
</script>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { EllipsisVertical } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    items?: Array<DropMenuItem>
    multiple?: boolean
    modelValue?: Array<string | number>
    triggerText?: string
    triggerClass?: string
  }>(),
  {
    items: () => [],
    multiple: false,
    modelValue: () => [],
    triggerText: '',
    triggerClass: '',
  },
)

const emit = defineEmits<{
  (e: 'select', item: DropMenuItem & { selected?: boolean }): void
  (e: 'update:modelValue', value: Array<string | number>): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)
const verticalPlacement = ref<'top' | 'bottom'>('bottom')
const horizontalPlacement = ref<'left' | 'right'>('right')
const selectedValues = ref<Set<string | number>>(new Set())

const MENU_OFFSET_PX = 8
const VIEWPORT_PADDING_PX = 8
const DEFAULT_MENU_MIN_WIDTH_PX = 192

const menuPosition = ref({ left: 0, top: 0 })
const triggerWidth = ref<number | null>(null)
const menuMaxHeight = ref<number | null>(null)

const menuInlineStyle = computed(() => {
  const style: Record<string, string> = {
    position: 'fixed',
    top: `${menuPosition.value.top}px`,
    left: `${menuPosition.value.left}px`,
  }

  const baseMinWidth =
    triggerWidth.value !== null
      ? Math.max(triggerWidth.value, DEFAULT_MENU_MIN_WIDTH_PX)
      : DEFAULT_MENU_MIN_WIDTH_PX

  style.minWidth = `${baseMinWidth}px`

  if (menuMaxHeight.value !== null) {
    style.maxHeight = `${menuMaxHeight.value}px`
    style.overflowY = 'auto'
  }

  return style
})

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

function applyMenuPosition(containerRect: DOMRect) {
  const menuElement = menuRef.value
  if (!menuElement) {
    return
  }

  triggerWidth.value = containerRect.width

  const menuRect = menuElement.getBoundingClientRect()

  let top =
    verticalPlacement.value === 'bottom'
      ? containerRect.bottom + MENU_OFFSET_PX
      : containerRect.top - MENU_OFFSET_PX - menuRect.height

  let left =
    horizontalPlacement.value === 'left' ? containerRect.left : containerRect.right - menuRect.width

  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - menuRect.width - VIEWPORT_PADDING_PX,
  )
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - menuRect.height - VIEWPORT_PADDING_PX,
  )

  left = clamp(left, VIEWPORT_PADDING_PX, maxLeft)
  top = clamp(top, VIEWPORT_PADDING_PX, maxTop)

  menuPosition.value = { left, top }
  menuMaxHeight.value = window.innerHeight - VIEWPORT_PADDING_PX * 2
}

function clampMenuToViewport() {
  const menuElement = menuRef.value
  if (!menuElement) {
    return
  }

  const rect = menuElement.getBoundingClientRect()
  const maxLeft = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerWidth - rect.width - VIEWPORT_PADDING_PX,
  )
  const maxTop = Math.max(
    VIEWPORT_PADDING_PX,
    window.innerHeight - rect.height - VIEWPORT_PADDING_PX,
  )

  const left = clamp(rect.left, VIEWPORT_PADDING_PX, maxLeft)
  const top = clamp(rect.top, VIEWPORT_PADDING_PX, maxTop)

  if (left !== rect.left || top !== rect.top) {
    menuPosition.value = { left, top }
  }

  menuMaxHeight.value = window.innerHeight - VIEWPORT_PADDING_PX * 2
}

function getItemValue(item: DropMenuItem, index: number): string | number {
  return item.value ?? item.label ?? index
}

function isItemSelected(item: DropMenuItem, index: number): boolean {
  return selectedValues.value.has(getItemValue(item, index))
}

function syncSelectedFromModel() {
  if (!props.multiple) {
    selectedValues.value = new Set()
    return
  }

  const explicitSelection = props.modelValue?.length ? props.modelValue : undefined
  if (explicitSelection) {
    selectedValues.value = new Set(explicitSelection)
    return
  }

  const inferredSelection = props.items
    .map((item, index) => (item.selected ? getItemValue(item, index) : undefined))
    .filter((value): value is string | number => value !== undefined)

  selectedValues.value = new Set(inferredSelection)
}

function closeMenu() {
  showMenu.value = false
  verticalPlacement.value = 'bottom'
  horizontalPlacement.value = 'right'
  triggerWidth.value = null
  menuMaxHeight.value = null
}

function handleGlobalPointerDown(event: PointerEvent) {
  const targetNode = event.target as Node | null
  const isInTrigger = Boolean(targetNode && containerRef.value?.contains(targetNode))
  const isInMenu = Boolean(targetNode && menuRef.value?.contains(targetNode))

  if (!isInTrigger && !isInMenu) {
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
  const containerElement = containerRef.value
  if (!menuElement || !containerElement) {
    return
  }

  if (options.reset) {
    verticalPlacement.value = 'bottom'
    horizontalPlacement.value = 'right'
  }

  const containerRect = containerElement.getBoundingClientRect()

  applyMenuPosition(containerRect)
  await nextTick()

  let rect = menuElement.getBoundingClientRect()

  if (rect.right > window.innerWidth) {
    horizontalPlacement.value = 'left'
    applyMenuPosition(containerRect)
    await nextTick()
    rect = menuElement.getBoundingClientRect()
  }

  if (rect.left < 0) {
    menuPosition.value = {
      ...menuPosition.value,
      left: VIEWPORT_PADDING_PX,
    }
    await nextTick()
    rect = menuElement.getBoundingClientRect()
  }

  if (rect.bottom > window.innerHeight && window.innerHeight >= rect.height) {
    verticalPlacement.value = 'top'
    applyMenuPosition(containerRect)
    await nextTick()
    rect = menuElement.getBoundingClientRect()

    if (rect.top < 0) {
      verticalPlacement.value = 'bottom'
      applyMenuPosition(containerRect)
      await nextTick()
      rect = menuElement.getBoundingClientRect()
    }
  } else if (rect.top < 0 && window.innerHeight >= rect.height) {
    verticalPlacement.value = 'bottom'
    applyMenuPosition(containerRect)
    await nextTick()
    rect = menuElement.getBoundingClientRect()
  }

  await nextTick()
  clampMenuToViewport()
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

function performAction(item: DropMenuItem, index: number) {
  if (item.disabled) {
    return
  }

  if (props.multiple) {
    toggleSelection(item, index)
    return
  }

  item.action?.()
  closeMenu()
  emit('select', item)
}

function toggleSelection(item: DropMenuItem, index: number) {
  const value = getItemValue(item, index)
  const nextSelection = new Set(selectedValues.value)
  const wasSelected = nextSelection.has(value)

  if (wasSelected) {
    nextSelection.delete(value)
  } else {
    nextSelection.add(value)
  }

  selectedValues.value = nextSelection
  emit('update:modelValue', Array.from(nextSelection))
  emit('select', { ...item, selected: !wasSelected })
}

watch(
  () => props.multiple,
  () => {
    syncSelectedFromModel()
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  () => {
    if (props.multiple) {
      selectedValues.value = new Set(props.modelValue ?? [])
    }
  },
  { deep: true },
)

watch(
  () => props.items,
  () => {
    if (props.multiple && (!props.modelValue || props.modelValue.length === 0)) {
      syncSelectedFromModel()
    }
  },
  { deep: true },
)

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
    <slot name="trigger" :toggle="toggleMenu" :open="showMenu">
      <button
        class="btn btn-sm icon-btn"
        :class="props.triggerClass"
        title="Menu"
        aria-haspopup="menu"
        :aria-expanded="showMenu ? 'true' : 'false'"
        @click.stop="toggleMenu"
        @keydown.enter.prevent="toggleMenu"
        @keydown.space.prevent="toggleMenu"
      >
        <span v-if="props.triggerText">{{ props.triggerText }}</span>
        <EllipsisVertical v-else class="icon" :size="10" />
      </button>
    </slot>

    <Teleport to="body">
      <div
        v-if="props.items && showMenu"
        ref="menuRef"
        class="fixed dropmenu-panel z-10"
        :style="menuInlineStyle"
        role="menu"
      >
        <slot name="items">
          <button
            v-for="(item, index) in props.items"
            :key="index"
            class="dropmenu-item"
            :class="item.className"
            :style="item.style"
            :disabled="item.disabled"
            @click="performAction(item, index)"
            :role="props.multiple ? 'menuitemcheckbox' : 'menuitem'"
            :aria-checked="props.multiple ? isItemSelected(item, index) : undefined"
          >
            <span class="flex-1 truncate">{{ item.label }}</span>
            <span v-if="props.multiple && isItemSelected(item, index)" aria-hidden="true">✓</span>
          </button>
        </slot>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dropmenu-panel {
  background: var(--panel-bg);
  border: 1px solid var(--color-text);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  border-radius: var(--radius-menu);
  padding: 0;
}
.dropmenu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--color-text);
  background: transparent;
  border-top: 1px solid var(--color-text-dim);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.dropmenu-item:first-of-type {
  border-top: none;
}
.dropmenu-item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--panel-bg) 70%, var(--color-text) 8%);
}
.dropmenu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
