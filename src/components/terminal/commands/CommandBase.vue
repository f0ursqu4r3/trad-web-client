<script lang="ts" setup>
import { computed, ref } from 'vue'
import DropMenu from '@/components/general/DropMenu.vue'
import { type DropMenuItem } from '@/components/general/DropMenu.vue'
import { ChevronDown, Pin } from 'lucide-vue-next'
import { formatName } from '@/lib/utils'
import type { CommandActionContextStatus } from '@/stores/command'

const props = withDefaults(
  defineProps<{
    commandId: string
    commandStatus: string
    commandKind?: string
    label?: string
    createdAt?: string | null
    nickname?: string | null
    nicknameColor?: string | null
    pinned?: boolean
    canCancel?: boolean
    canCancelRemainingEntry?: boolean
    canClosePosition?: boolean
    canPartialClosePosition?: boolean
    closePositionLabel?: string
    canContinueMissedEntry?: boolean
    canRefreshExchangeState?: boolean
    canEditProtection?: boolean
    actionContextStatus?: CommandActionContextStatus
    actionContextError?: string | null
    result?: string | null
  }>(),
  {
    commandKind: '',
    label: 'Trailing Entry',
    createdAt: null,
    nickname: null,
    nicknameColor: null,
    pinned: false,
    canCancel: false,
    canCancelRemainingEntry: false,
    canClosePosition: false,
    canPartialClosePosition: false,
    closePositionLabel: 'Close Command Exposure',
    canContinueMissedEntry: false,
    canRefreshExchangeState: false,
    canEditProtection: false,
    actionContextStatus: 'idle',
    actionContextError: null,
    result: null,
  },
)

const emit = defineEmits<{
  (e: 'select', commandId: string): void
  (e: 'duplicate', commandId: string): void
  (e: 'cancel', commandId: string): void
  (e: 'cancel-remaining-entry', commandId: string): void
  (e: 'inspect', commandId: string): void
  (e: 'close-position', commandId: string): void
  (e: 'partial-close-position', commandId: string): void
  (e: 'continue-missed-entry', commandId: string): void
  (e: 'refresh-exchange-state', commandId: string): void
  (e: 'edit-protection', commandId: string): void
  (e: 'rename', commandId: string): void
  (e: 'pin', commandId: string): void
  (e: 'request-action-context', commandId: string): void
}>()

const shortId = computed(() => props.commandId.slice(0, 8))
const expanded = ref(false)
const commandMenuRef = ref<{ openAt: (x: number, y: number) => void } | null>(null)
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
  return `command-status-${key}`
})

const menuItems = computed<Array<DropMenuItem>>(() => {
  const items: Array<DropMenuItem> = [
    {
      label: 'Inspect',
      action: () => emit('inspect', props.commandId),
    },
    {
      label: 'Nickname',
      action: () => emit('rename', props.commandId),
    },
    {
      label: 'Duplicate',
      action: () => emit('duplicate', props.commandId),
    },
  ]
  const actionContextReady = !['loading', 'error'].includes(props.actionContextStatus)
  if (actionContextReady && props.canClosePosition) {
    items.push({
      label: props.closePositionLabel,
      title: props.closePositionLabel.startsWith('Cancel')
        ? "Cancels the remaining entry, then submits a reduce-only market close for this command's filled exposure. Other command and external exposure is unchanged."
        : "Submits a reduce-only market close for this command's owned exposure. Other command and external exposure is unchanged.",
      action: () => emit('close-position', props.commandId),
    })
  }
  if (actionContextReady && props.canPartialClosePosition) {
    items.push({
      label: 'Close Part...',
      action: () => emit('partial-close-position', props.commandId),
    })
  }
  if (actionContextReady && props.canCancelRemainingEntry) {
    items.push({
      label: 'Cancel Remaining',
      action: () => emit('cancel-remaining-entry', props.commandId),
    })
  }
  if (
    actionContextReady &&
    props.commandKind === 'TrailingEntryOrder' &&
    props.canContinueMissedEntry
  ) {
    items.push({
      label: 'Continue Anyway',
      action: () => emit('continue-missed-entry', props.commandId),
    })
  }
  if (actionContextReady && props.canCancel) {
    items.push({
      label: 'Cancel',
      action: () => emit('cancel', props.commandId),
    })
  }
  if (props.canRefreshExchangeState) {
    items.push({
      label: 'Refresh Exchange State',
      action: () => emit('refresh-exchange-state', props.commandId),
    })
  }
  if (actionContextReady && props.canEditProtection) {
    items.push({
      label: 'Edit Protection',
      action: () => emit('edit-protection', props.commandId),
    })
  }
  if (props.actionContextStatus === 'loading') {
    items.push({
      label: 'Loading live actions...',
      disabled: true,
    })
  } else if (props.actionContextStatus === 'error') {
    items.push({
      label: props.actionContextError
        ? `Live actions unavailable: ${props.actionContextError}`
        : 'Live actions unavailable',
      disabled: true,
      className: 'text-[var(--color-error)]',
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

function openContextMenu(event: MouseEvent) {
  if (event.shiftKey) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  commandMenuRef.value?.openAt(event.clientX, event.clientY)
}

// Detail formatting is handled by child components using this wrapper.
</script>

<template>
  <div
    class="flex flex-col shadow-sm cursor-pointer command-row relative"
    :class="props.pinned ? 'command-row-pinned' : ''"
    @click="emit('inspect', commandId)"
    @contextmenu="openContextMenu"
  >
    <div class="command-status-bar" :class="statusClass"></div>
    <div class="flex items-start justify-between gap-3 px-3 py-2">
      <div class="flex items-center flex-wrap gap-2">
        <span class="font-normal text-[13px] text-[var(--color-text-dim)] cursor-pointer">
          {{ formatName(label) }}
        </span>
        <span
          class="font-mono text-[10px] text-[var(--color-text-dim)] cursor-copy select-text rounded-[2px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
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
        <span
          v-if="props.nickname"
          class="text-[12px] font-medium"
          :style="{ color: props.nicknameColor ?? 'var(--color-text)' }"
        >
          {{ props.nickname }}
        </span>
      </div>

      <div class="flex items-center justify-end flex-wrap gap-2">
        <span v-if="createdAtLabel" class="text-[10px] text-[var(--color-text-dim)] font-mono">
          {{ createdAtLabel }}
        </span>
        <span class="text-[11px] text-[var(--color-text-dim)] uppercase tracking-[0.04em]">
          {{ commandStatus }}
        </span>

        <div class="flex items-center gap-2">
          <button
            class="btn btn-sm icon-btn command-action-btn"
            :title="props.pinned ? 'Unpin' : 'Pin'"
            :aria-pressed="props.pinned"
            @click.stop="emit('pin', props.commandId)"
          >
            <Pin :size="10" :class="props.pinned ? 'pin-active' : ''" />
          </button>
          <DropMenu
            ref="commandMenuRef"
            :items="menuItems"
            trigger-class="command-action-btn"
            @open="emit('request-action-context', props.commandId)"
          />

          <button
            class="btn btn-sm icon-btn command-action-btn"
            :title="expanded ? 'Collapse' : 'Expand'"
            @click.stop="expanded = !expanded"
            aria-label="Toggle details"
          >
            <ChevronDown
              class="icon"
              :size="10"
              :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }"
            />
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="props.result && ['Failed', 'Malformed'].includes(props.commandStatus)"
      class="mx-3 mb-2 mt-0 border-l-2 border-[var(--color-error)] pl-2 text-[11px] text-error"
      :title="props.result"
    >
      {{ props.result }}
    </p>

    <div v-if="expanded" class="px-3 py-2">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.command-status-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}
.command-status-success {
  background-color: var(--color-success);
}
.command-status-error {
  background-color: var(--color-error);
}
.command-status-warning {
  background-color: var(--color-warning);
}
.command-status-info {
  background-color: var(--color-info);
}
.command-status-neutral {
  background-color: var(--color-text-dim);
}
:deep(.command-action-btn) {
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  line-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-btn);
  background: transparent;
  box-shadow: none;
}
:deep(.command-action-btn .icon) {
  display: block;
}
.command-row-pinned {
  background: color-mix(in srgb, var(--panel-bg) 70%, var(--accent-color) 6%);
}
.pin-active {
  color: var(--accent-color);
  transform: rotate(-90deg);
}
</style>
