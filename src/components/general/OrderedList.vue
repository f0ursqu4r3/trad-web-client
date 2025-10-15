<script lang="ts" setup>
import { computed, ref, watch } from 'vue'

type KeyExtractor = (item: unknown, index: number) => string | number
type DropLocation = {
  index: number
  position: 'before' | 'after'
}

const props = defineProps<{
  /**
   * Items to render within the ordered list.
   */
  items: unknown[]
  /**
   * Optional key extractor to create stable keys for list items.
   * Accepts either a property name or a function returning a string/number.
   */
  itemKey?: string | KeyExtractor
  /**
   * Prevent interaction when true.
   */
  disabled?: boolean
  /**
   * Extra classes to merge onto the root ordered list element.
   */
  listClass?: string | string[] | Record<string, boolean>
  /**
   * Extra classes to merge onto each list item element.
   */
  itemClass?: string | string[] | Record<string, boolean>
}>()

const emit = defineEmits<{
  /**
   * Emitted with the new ordered items whenever a reorder happens.
   */
  (e: 'update:items', value: unknown[]): void
  /**
   * Emitted after a successful reorder with additional context.
   */
  (
    e: 'reorder',
    payload: {
      items: unknown[]
      from: number
      to: number
    },
  ): void
}>()

const internalItems = ref<unknown[]>([...props.items])
const draggingIndex = ref<number | null>(null)
const dropLocation = ref<DropLocation | null>(null)

const arraysMatch = (first: unknown[], second: unknown[]) => {
  if (first.length !== second.length) return false
  return first.every((item, index) => item === second[index])
}

watch(
  () => props.items,
  (next) => {
    if (!arraysMatch(internalItems.value, next)) {
      internalItems.value = [...next]
    }
  },
  { deep: true },
)

const keyFn = computed<KeyExtractor>(() => {
  if (typeof props.itemKey === 'function') {
    return props.itemKey as KeyExtractor
  }

  if (typeof props.itemKey === 'string') {
    return (item: unknown, index: number) => {
      const candidate = (item as Record<string, unknown> | undefined)?.[props.itemKey as string]
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return candidate
      }
      return `${props.itemKey}-${index}`
    }
  }

  return (_item, index) => index
})

const resetDragState = () => {
  draggingIndex.value = null
  dropLocation.value = null
}

const reorderItems = (from: number, rawTo: number) => {
  if (from < 0 || rawTo < 0) {
    resetDragState()
    return
  }

  const normalizedTo = from < rawTo ? rawTo - 1 : rawTo
  if (normalizedTo === from) {
    resetDragState()
    return
  }

  const updated = [...internalItems.value]
  const [movedItem] = updated.splice(from, 1)

  if (movedItem === undefined) {
    resetDragState()
    return
  }

  const safeIndex = Math.min(Math.max(normalizedTo, 0), updated.length)
  updated.splice(safeIndex, 0, movedItem)

  internalItems.value = updated
  emit('update:items', [...updated])
  emit('reorder', { items: [...updated], from, to: safeIndex })

  resetDragState()
}

const handleDragStart = (index: number, event: DragEvent) => {
  if (props.disabled) {
    event.preventDefault()
    return
  }

  draggingIndex.value = index
  dropLocation.value = null

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

const handleDragOver = (index: number, event: DragEvent) => {
  if (props.disabled || draggingIndex.value === null) {
    return
  }

  event.preventDefault()

  const target = event.currentTarget as HTMLElement | null
  if (!target) {
    return
  }

  const rect = target.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2
  const position: DropLocation['position'] = event.clientY > midpoint ? 'after' : 'before'

  dropLocation.value = { index, position }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleDrop = (index: number, event: DragEvent) => {
  if (props.disabled || draggingIndex.value === null) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  const position = dropLocation.value?.position ?? 'before'
  const targetIndex = position === 'after' ? index + 1 : index

  reorderItems(draggingIndex.value, targetIndex)
}

const handleListDrop = (event: DragEvent) => {
  if (props.disabled || draggingIndex.value === null) {
    return
  }

  event.preventDefault()
  reorderItems(draggingIndex.value, internalItems.value.length)
}

const handleListDragOver = (event: DragEvent) => {
  if (props.disabled || draggingIndex.value === null) {
    return
  }

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }

  if (internalItems.value.length === 0) {
    dropLocation.value = { index: 0, position: 'before' }
  } else {
    dropLocation.value = {
      index: internalItems.value.length - 1,
      position: 'after',
    }
  }
}

const handleDragEnd = () => {
  resetDragState()
}

const showBefore = (index: number) =>
  dropLocation.value?.index === index && dropLocation.value?.position === 'before'
const showAfter = (index: number) =>
  dropLocation.value?.index === index && dropLocation.value?.position === 'after'
</script>

<template>
  <ol
    class="list-none space-y-1"
    :class="props.listClass"
    @dragover.self.prevent="handleListDragOver"
    @drop.self="handleListDrop"
  >
    <li
      v-for="(item, index) in internalItems"
      :key="keyFn(item, index)"
      class="relative rounded border border-transparent px-3 py-2 transition-colors"
      :class="[
        props.itemClass,
        {
          'opacity-60': draggingIndex === index,
          'cursor-grab active:cursor-grabbing': !props.disabled,
          'cursor-not-allowed opacity-50': props.disabled,
        },
      ]"
      :draggable="!props.disabled"
      @dragstart="handleDragStart(index, $event)"
      @dragover="handleDragOver(index, $event)"
      @drop="handleDrop(index, $event)"
      @dragend="handleDragEnd"
    >
      <div
        v-if="showBefore(index)"
        class="drop-indicator absolute left-2 right-2 top-0 h-0.5 -translate-y-1/2 rounded-full"
      />
      <div class="flex items-center gap-2">
        <div class="flex-1 select-none">
          <slot :item="item" :index="index" :is-dragging="draggingIndex === index">
            {{ item }}
          </slot>
        </div>
      </div>
      <div
        v-if="showAfter(index)"
        class="drop-indicator absolute left-2 right-2 bottom-0 h-0.5 translate-y-1/2 rounded-full"
      />
    </li>
  </ol>
</template>

<style scoped>
.drop-indicator {
  background-color: var(--accent-color, #3b82f6);
}
</style>
