<script lang="ts" setup>
import { computed, ref } from 'vue'
import DropMenu from '@/components/general/DropMenu.vue'
import { type DropMenuItem } from '@/components/general/DropMenu.vue'
import { DownIcon } from '@/components/icons'
import { formatName } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    commandId: string
    commandStatus: string
    commandSymbol?: string
    label?: string
    createdAt?: string | null
  }>(),
  {
    label: 'Trailing Entry',
    createdAt: null,
  },
)

const emit = defineEmits<{
  (e: 'select', commandId: string): void
  (e: 'duplicate', commandId: string): void
  (e: 'cancel', commandId: string): void
  (e: 'inspect', commandId: string): void
  (e: 'close-position', commandId: string): void
}>()

const shortId = computed(() => props.commandId.slice(0, 8))
const expanded = ref(false)
const createdAtLabel = computed(() => {
  if (!props.createdAt) return ''
  try {
    return new Date(props.createdAt).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
})

const canCancel = computed(() =>
  ['Unsent', 'Pending', 'Running', 'Malformed'].includes(props.commandStatus),
)

const statusClass = computed(() => {
  const map: Record<string, string> = {
    Unsent: 'neutral',
    Pending: 'neutral',
    Malformed: 'error',
    Running: 'info',
    Succeeded: 'success',
    Failed: 'error',
  }
  const key = map[props.commandStatus] || 'neutral'
  return `command-row-${key}`
})

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
  if (props.label === 'TrailingEntryOrder') {
    items.push({
      label: 'Close Position',
      action: () => emit('close-position', props.commandId),
    })
  }
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
    class="flex flex-col bg-(--color-bg) dark:bg-(--color-bg) rounded-lg shadow-sm cursor-pointer command-row"
    :class="statusClass"
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
        <span v-if="createdAtLabel" class="text-[10px] text-gray-500 font-mono">
          {{ createdAtLabel }}
        </span>
        <span class="text-[11px] text-[var(--color-text-dim)] uppercase tracking-[0.04em]">
          {{ commandStatus }}
        </span>

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

<style scoped>
.command-row-success {
  background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
}
.command-row-error {
  background-color: color-mix(in srgb, var(--color-error) 14%, transparent);
}
.command-row-warning {
  background-color: color-mix(in srgb, var(--color-warning) 12%, transparent);
}
.command-row-info {
  background-color: color-mix(in srgb, var(--color-info) 12%, transparent);
}
.command-row-neutral {
  background-color: color-mix(in srgb, var(--color-text-dim) 6%, transparent);
}
</style>
