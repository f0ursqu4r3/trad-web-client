<script lang="ts" setup>
import { computed, ref } from 'vue'
import DropMenu from '@/components/general/DropMenu.vue'
import { type DropMenuItem } from '@/components/general/DropMenu.vue'
import { ChevronDown, Pin } from 'lucide-vue-next'
import { formatName } from '@/lib/utils'
import type { CommandActionContextStatus } from '@/stores/command'
import { CommandEffectKind, type CommandEffectRecord } from '@/lib/ws/protocol'
import { longPress } from '@/lib/longPress'
import type { CommandMenuAction } from './presentation'

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
    canEditProtection?: boolean
    canEditTrailingEntry?: boolean
    canActivateTrailingEntry?: boolean
    canEnterTrailingEntry?: boolean
    canDuplicate?: boolean
    actionContextStatus?: CommandActionContextStatus
    actionContextError?: string | null
    result?: string | null
    flattenedByEffects?: CommandEffectRecord[]
    flattenEffects?: CommandEffectRecord[]
    menuActions?: CommandMenuAction[]
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
    canEditProtection: false,
    canEditTrailingEntry: false,
    canActivateTrailingEntry: false,
    canEnterTrailingEntry: false,
    canDuplicate: true,
    actionContextStatus: 'idle',
    actionContextError: null,
    result: null,
    flattenedByEffects: () => [],
    flattenEffects: () => [],
    menuActions: () => [],
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
  (e: 'edit-protection', commandId: string): void
  (e: 'edit-trailing-entry', commandId: string): void
  (e: 'activate-trailing-entry', commandId: string): void
  (e: 'enter-trailing-entry', commandId: string): void
  (e: 'rename', commandId: string): void
  (e: 'pin', commandId: string): void
  (e: 'request-action-context', commandId: string): void
  (e: 'inspect-related', commandId: string): void
  (e: 'menu-action', actionId: string): void
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

const flattenedByLinks = computed(() => {
  const grouped = new Map<string, CommandEffectRecord[]>()
  props.flattenedByEffects.forEach((effect) => {
    const records = grouped.get(effect.source_command_id) ?? []
    records.push(effect)
    grouped.set(effect.source_command_id, records)
  })
  return Array.from(grouped.entries()).map(([commandId, effects]) => {
    const kinds = new Set(effects.map((effect) => effect.effect))
    const label = kinds.has(CommandEffectKind.PositionClosed)
      ? 'Closed by Flatten'
      : kinds.has(CommandEffectKind.AlreadyFlat) && kinds.has(CommandEffectKind.EntryCanceled)
        ? 'Entry canceled · flat'
        : kinds.has(CommandEffectKind.AlreadyFlat)
          ? 'Flatten confirmed flat'
          : kinds.has(CommandEffectKind.EntryCanceled)
            ? 'Entry canceled by Flatten'
            : 'Protection cleared by Flatten'
    return { commandId, label, effects }
  })
})

const affectedCommandLinks = computed(() => {
  const grouped = new Map<string, CommandEffectRecord[]>()
  props.flattenEffects.forEach((effect) => {
    const records = grouped.get(effect.affected_command_id) ?? []
    records.push(effect)
    grouped.set(effect.affected_command_id, records)
  })
  return Array.from(grouped.entries()).map(([commandId, effects]) => ({
    commandId,
    effects,
    symbol: effects[0]?.symbol ?? '',
  }))
})

function effectNames(effects: CommandEffectRecord[]): string {
  return Array.from(new Set(effects.map((effect) => formatName(effect.effect)))).join(', ')
}

const statusClass = computed(() => {
  const map: Record<string, string> = {
    Unsent: 'neutral',
    Pending: 'neutral',
    Malformed: 'error',
    Running: 'info',
    Succeeded: 'success',
    Failed: 'error',
    Canceled: 'warning',
    'Partially Succeeded': 'warning',
    'Reconciliation Required': 'error',
  }
  const key = map[props.commandStatus] || 'neutral'
  return `command-status-${key}`
})

const menuItems = computed<Array<DropMenuItem>>(() => {
  const items: Array<DropMenuItem> = [
    {
      label: 'Nickname / Color...',
      action: () => emit('rename', props.commandId),
    },
  ]
  if (props.canDuplicate) {
    items.push({
      label: 'Duplicate',
      action: () => emit('duplicate', props.commandId),
    })
  }
  const actionContextReady = !['loading', 'error'].includes(props.actionContextStatus)
  if (actionContextReady && props.canActivateTrailingEntry) {
    items.push({
      label: 'Activate Now',
      title: 'Begin trailing from the latest authoritative stream price. No order is submitted.',
      action: () => emit('activate-trailing-entry', props.commandId),
    })
  }
  if (actionContextReady && props.canEnterTrailingEntry) {
    items.push({
      label: 'Enter Now...',
      title:
        'Bypass the trailing wait and submit the entry through the normal protection pipeline.',
      action: () => emit('enter-trailing-entry', props.commandId),
    })
  }
  if (actionContextReady && props.canEditTrailingEntry) {
    items.push({
      label: 'Edit TE...',
      action: () => emit('edit-trailing-entry', props.commandId),
    })
  }
  if (actionContextReady && props.canClosePosition) {
    items.push({
      label: props.closePositionLabel,
      title: props.closePositionLabel.startsWith('Cancel')
        ? "Cancels the remaining entry, then closes this command's filled exposure. Other command and outside-Trad exposure is unchanged."
        : "Closes this command's owned exposure. Other command and outside-Trad exposure is unchanged.",
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
  if (actionContextReady && props.canEditProtection) {
    items.push({
      label: 'Edit Protection',
      action: () => emit('edit-protection', props.commandId),
    })
  }
  for (const action of props.menuActions) {
    items.push({
      label: action.label,
      title: action.title,
      disabled: action.disabled,
      className: action.danger ? 'text-[var(--color-error)]' : undefined,
      action: () => emit('menu-action', action.id),
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

const touchContext = longPress((_commandId: string, x, y) => {
  commandMenuRef.value?.openAt(x, y)
})

// Detail formatting is handled by child components using this wrapper.
</script>

<template>
  <div
    class="flex flex-col shadow-sm cursor-pointer command-row relative"
    :class="props.pinned ? 'command-row-pinned' : ''"
    @click="emit('inspect', commandId)"
    @click.capture="touchContext.suppressClick"
    @contextmenu="openContextMenu"
    @pointerdown="touchContext.start($event, commandId)"
    @pointermove="touchContext.move"
    @pointerup="touchContext.end"
    @pointercancel="touchContext.end"
  >
    <div class="command-status-bar" :class="statusClass"></div>
    <div class="flex items-start justify-between gap-3 px-3 py-2">
      <div class="flex items-center flex-wrap gap-2">
        <span class="font-normal text-[13px] text-[var(--color-text-dim)] cursor-pointer">
          {{ formatName(label) }}
        </span>
        <span
          class="inline-flex min-h-6 items-center font-mono text-[11px] text-[var(--color-text-dim)] cursor-copy select-text rounded-[2px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
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
        <button
          v-for="link in flattenedByLinks"
          :key="link.commandId"
          class="command-effect-link"
          :title="`${effectNames(link.effects)} via flatten command ${link.commandId}`"
          @click.stop="emit('inspect-related', link.commandId)"
        >
          {{ link.label }} #{{ link.commandId.slice(0, 8) }}
        </button>
        <span
          v-if="affectedCommandLinks.length"
          class="command-effect-summary"
          :title="`${affectedCommandLinks.length} command(s) affected by this flatten operation`"
        >
          {{ affectedCommandLinks.length }} affected
        </span>
      </div>

      <div class="flex items-center justify-end flex-wrap gap-2">
        <span v-if="createdAtLabel" class="text-[11px] text-[var(--color-text-dim)] font-mono">
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
      <div v-if="affectedCommandLinks.length" class="command-effect-details">
        <div class="command-effect-heading">Affected commands</div>
        <button
          v-for="link in affectedCommandLinks"
          :key="link.commandId"
          class="command-effect-detail-link"
          :title="link.commandId"
          @click.stop="emit('inspect-related', link.commandId)"
        >
          <span>{{ link.symbol }}</span>
          <span>#{{ link.commandId.slice(0, 8) }}</span>
          <span>{{ effectNames(link.effects) }}</span>
        </button>
      </div>
      <p
        v-if="props.result && !['Failed', 'Malformed'].includes(props.commandStatus)"
        class="command-result"
      >
        {{ props.result }}
      </p>
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
.command-effect-link,
.command-effect-summary {
  border: 1px solid color-mix(in srgb, var(--color-info) 55%, var(--border-color));
  border-radius: 2px;
  background: color-mix(in srgb, var(--color-info) 10%, transparent);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  padding: 1px 4px;
}
.command-effect-link:hover,
.command-effect-detail-link:hover {
  border-color: var(--color-info);
  color: var(--color-info);
}
.command-effect-details {
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 8px;
}
.command-effect-heading {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  margin-bottom: 4px;
  text-transform: uppercase;
}
.command-effect-detail-link {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-dim);
  display: grid;
  font-family: var(--font-mono);
  font-size: 11px;
  gap: 8px;
  grid-template-columns: minmax(48px, auto) minmax(72px, auto) 1fr;
  padding: 3px 4px;
  text-align: left;
  width: 100%;
}
.command-result {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  margin: 8px 0 0;
  white-space: pre-wrap;
}
</style>
