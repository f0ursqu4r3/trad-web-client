<script lang="ts" setup>
import { computed, ref } from 'vue'
import type { TrailingEntryOrderCommand } from '@/lib/ws/protocol'
import { useCommandStore } from '@/stores/command'
import { DownIcon, MagnifyingGlassIcon } from '@/components/icons'
import DropMenu from '@/components/general/DropMenu.vue'
import { type DropMenuItem } from '@/components/general/DropMenu.vue'
import StatusIndicator from '@/components/general/StatusIndicator.vue'

const props = defineProps<{
  command_id: string
  command: TrailingEntryOrderCommand
  command_status: string
}>()

const emit = defineEmits<{
  (e: 'select', commandId: string): void
}>()

const shortId = computed(() => props.command_id.slice(0, 8))
const expanded = ref(false)
const showMenu = ref(false)

const commandStore = useCommandStore()

const canCancel = computed(() =>
  ['Unsent', 'Pending', 'Running', 'Malformed'].includes(props.command_status),
)

const statusMap: Record<string, string> = {
  Unsent: 'neutral',
  Pending: 'neutral',
  Malformed: 'error',
  Running: 'info',
  Succeeded: 'success',
  Failed: 'error',
}

const menuItems: Array<DropMenuItem> = [
  {
    label: 'Inspect devices',
    action: inspectDevices,
  },
  {
    label: 'Cancel command',
    action: cancelCommand,
    disabled: !canCancel.value,
  },
]

async function copyId() {
  try {
    await navigator.clipboard.writeText(props.command_id)
  } catch {
    // no-op if clipboard blocked
  }
}

function fmtUsd(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPrice(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n)
}

function fmtPct(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(n)
}

function inspectDevices() {
  commandStore.inspectCommand(props.command_id)
  showMenu.value = false
}

function cancelCommand() {
  commandStore.cancelCommand(props.command_id)
  showMenu.value = false
}
</script>

<template>
  <div class="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm">
    <div class="flex items-start justify-between gap-3 px-3 py-2">
      <div class="flex items-center gap-2">
        <span
          class="uppercase font-bold text-[12px] tracking-[0.06em] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded"
        >
          Trailing Entry
        </span>
        <span
          class="font-mono text-[10px] text-gray-500 dark:text-gray-300 cursor-pointer select-text rounded-[2px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
          :title="command_id"
          @click="copyId"
          role="button"
          tabindex="0"
          @keydown.enter.prevent="copyId"
          @keydown.space.prevent="copyId"
          aria-label="Copy command id"
        >
          #{{ shortId }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <div
          class="pill flex gap-2"
          :class="`pill-${statusMap[command_status]}`"
          :aria-label="command_status"
          role="status"
        >
          <StatusIndicator :status="statusMap[command_status]" />
          <span class="text-[11px]">{{ command_status }}</span>
        </div>

        <button
          class="btn btn-sm icon-btn"
          title="Select command"
          @click="emit('select', command_id)"
        >
          <MagnifyingGlassIcon class="icon" size="10" />
        </button>

        <button
          class="btn btn-sm icon-btn"
          :title="expanded ? 'Collapse' : 'Expand'"
          @click="expanded = !expanded"
          aria-label="Toggle details"
        >
          <DownIcon
            class="icon"
            size="10"
            :style="{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }"
          />
        </button>

        <DropMenu :items="menuItems" />
      </div>
    </div>

    <div v-if="expanded" class="px-3 py-2">
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 m-0">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-gray-500 mb-1">Symbol</dt>
          <dd class="m-0 text-[12px] font-mono">{{ command.symbol }}</dd>
        </div>

        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-gray-500 mb-1">Activation</dt>
          <dd class="m-0 text-[12px]">{{ fmtPrice(command.activation_price) }}</dd>
        </div>

        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-gray-500 mb-1">Jump Frac</dt>
          <dd class="m-0 text-[12px]">{{ fmtPct(command.jump_frac_threshold) }}</dd>
        </div>

        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-gray-500 mb-1">Stop Loss</dt>
          <dd class="m-0 text-[12px]">{{ fmtPrice(command.stop_loss) }}</dd>
        </div>

        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-gray-500 mb-1">Risk</dt>
          <dd class="m-0 text-[12px]">{{ fmtUsd(command.risk_amount) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
