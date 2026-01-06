<script lang="ts" setup>
import { computed, ref } from 'vue'
import DropMenu from '@/components/general/DropMenu.vue'
import { type DropMenuItem } from '@/components/general/DropMenu.vue'
import StatusIndicator from '@/components/general/StatusIndicator.vue'
import { DownIcon } from '@/components/icons'
import { formatName } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    commandId: string
    commandStatus: string
    commandSymbol?: string
    label?: string
  }>(),
  {
    label: 'Trailing Entry',
  },
)

const emit = defineEmits<{
  (e: 'select', commandId: string): void
  (e: 'duplicate', commandId: string): void
  (e: 'cancel', commandId: string): void
  (e: 'inspect', commandId: string): void
}>()

const shortId = computed(() => props.commandId.slice(0, 8))
const expanded = ref(false)

const canCancel = computed(() =>
  ['Unsent', 'Pending', 'Running', 'Malformed'].includes(props.commandStatus),
)

const statusMap: Record<string, string> = {
  Unsent: 'neutral',
  Pending: 'neutral',
  Malformed: 'error',
  Running: 'info',
  Succeeded: 'success',
  Failed: 'error',
}

const menuItems = computed<Array<DropMenuItem>>(() => {
  const items = [
    {
      label: 'Inspect',
      action: () => emit('inspect', props.commandId),
    },
    {
      label: 'Duplicate',
      action: () => emit('duplicate', props.commandId),
    },
  ]
  if (canCancel.value) {
    items.push({
      label: 'Cancel',
      action: () => emit('cancel', props.commandId),
    })
  }
  return items
})

async function copyId() {
  try {
    await navigator.clipboard.writeText(props.commandId)
  } catch {
    // no-op if clipboard blocked
  }
}

// Detail formatting is handled by child components using this wrapper.
</script>

<template>
  <div
    class="flex flex-col bg-(--color-bg) dark:bg-(--color-bg) rounded-lg shadow-sm cursor-pointer"
    @click="emit('inspect', commandId)"
  >
    <div class="flex items-start justify-between gap-3 px-3 py-2">
      <div class="flex items-center flex-wrap gap-2">
        <span
          class="uppercase font-bold text-[12px] tracking-[0.06em] bg-(--panel-header-bg) px-2 py-0.5 rounded cursor-pointer"
        >
          {{ formatName(label) }}
        </span>
        <span
          class="font-mono text-[10px] text-gray-500 dark:text-gray-300 cursor-copy select-text rounded-[2px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
          :title="props.commandId"
          @click.stop="copyId"
          role="button"
          tabindex="0"
          @keydown.enter.prevent="copyId"
          @keydown.space.prevent="copyId"
          aria-label="Copy command id"
        >
          #{{ shortId }}
        </span>
        <span v-if="commandSymbol" class="pill pill-sm">{{ commandSymbol }}</span>
      </div>

      <div class="flex items-center justify-end flex-wrap gap-2">
        <div
          class="pill flex gap-2"
          :class="`pill-${statusMap[commandStatus]}`"
          :aria-label="commandStatus"
          role="status"
        >
          <StatusIndicator :status="statusMap[commandStatus]" />
          <span class="text-[11px]">{{ commandStatus }}</span>
        </div>

        <div class="flex items-center gap-2">
          <DropMenu :items="menuItems" />

          <button
            class="btn btn-sm icon-btn"
            :title="expanded ? 'Collapse' : 'Expand'"
            @click.stop="expanded = !expanded"
            aria-label="Toggle details"
          >
            <DownIcon
              class="icon"
              size="10"
              :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }"
            />
          </button>
        </div>
      </div>
    </div>

    <div v-if="expanded" class="px-3 py-2">
      <slot />
    </div>
  </div>
</template>
