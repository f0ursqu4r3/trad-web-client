<template>
  <div class="command-entry panel-card">
    <div class="panel-header-row">
      <div class="inline-flex items-center gap-2">
        <span class="pill-info uppercase font-bold text-[10px] tracking-[0.06em]">
          {{ commandName }}
        </span>
        <span
          class="mono dim cursor-pointer select-text focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 rounded-[2px] text-[10px]"
          :title="command.command_id"
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
      <div class="inline-flex items-center gap-2">
        <div class="status" :data-status="command.status" :aria-label="command.status">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">{{ command.status }}</span>
        </div>
        <button
          class="btn btn-sm icon-btn"
          title="Select command"
          @click="emit('select', command.command_id)"
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
        <div class="menu-anchor">
          <button
            class="btn btn-sm icon-btn"
            title="More actions"
            aria-haspopup="menu"
            :aria-expanded="showMenu ? 'true' : 'false'"
            @click="toggleMenu"
            @keydown.enter.prevent="toggleMenu"
            @keydown.space.prevent="toggleMenu"
          >
            <MenuDotsIcon class="icon" size="10" />
          </button>
          <div v-if="showMenu" class="menu-dropdown" role="menu" @mouseleave="showMenu = false">
            <button type="button" class="menu-item" role="menuitem" @click="copyRaw">
              Copy raw command
            </button>
            <button type="button" class="menu-item" role="menuitem" @click="inspectDevices">
              Inspect devices
            </button>
            <button
              type="button"
              class="menu-item"
              role="menuitem"
              :disabled="!canCancel"
              @click="canCancel && cancelCommand()"
            >
              Cancel command
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="expanded" class="px-2 py-2">
      <dl
        class="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-2 m-0"
      >
        <div class="kv">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-0.5">
            Symbol
          </dt>
          <dd class="m-0 text-[12px] font-mono">{{ args?.symbol }}</dd>
        </div>
        <div class="kv">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-0.5">
            Activation
          </dt>
          <dd class="m-0 text-[12px]">{{ fmtPrice(args?.activationPrice) }}</dd>
        </div>
        <div class="kv">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-0.5">
            Jump Frac
          </dt>
          <dd class="m-0 text-[12px]">{{ fmtPct(args?.jumpFractionThreshold) }}</dd>
        </div>
        <div class="kv">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-0.5">
            Stop Loss
          </dt>
          <dd class="m-0 text-[12px]">{{ fmtPrice(args?.stopLoss) }}</dd>
        </div>
        <div class="kv">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-0.5">
            Risk
          </dt>
          <dd class="m-0 text-[12px]">{{ fmtUsd(args?.riskAmount) }}</dd>
        </div>
      </dl>
      <div class="grid grid-cols-[40px_1fr] gap-2 mt-2">
        <div class="flex items-center text-[10px] uppercase text-[var(--color-text-dim)]">Data</div>
        <pre
          class="m-0 px-2 py-1 border border-dashed border-[var(--border-color)] rounded bg-[var(--panel-bg)] text-[11px] whitespace-pre-wrap break-words font-mono"
          >{{ JSON.stringify(teData, null, 2) }}</pre
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import type { CommandHistoryItem } from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { DownIcon, MenuDotsIcon, MagnifyingGlassIcon } from '@/components/icons'

const props = defineProps<{
  command: CommandHistoryItem
}>()

const emit = defineEmits<{
  (e: 'select', commandId: string): void
}>()

// Extract typed TE command data
const teData = computed(() => {
  if (props.command.command.kind === 'TrailingEntryOrder') {
    return props.command.command.data
  }
  return null
})

const commandName = computed(() => {
  if (props.command.command.kind === 'TrailingEntryOrder') {
    const side = props.command.command.data.position_side
    return side === 'Long' ? 'te-long' : 'te-short'
  }
  return 'unknown'
})

const args = computed(() => {
  const data = teData.value
  if (!data) return null
  return {
    symbol: data.symbol,
    activationPrice: data.activation_price,
    jumpFractionThreshold: data.jump_frac_threshold,
    stopLoss: data.stop_loss,
    riskAmount: data.risk_amount,
  }
})

const shortId = computed(() => props.command.command_id.slice(0, 8))
const expanded = ref(false)
const showMenu = ref(false)
const ws = useWsStore()

const canCancel = computed(() =>
  ['Unsent', 'Pending', 'Running', 'Malformed'].includes(props.command.status),
)

function toggleMenu() {
  showMenu.value = !showMenu.value
}

async function copyId() {
  try {
    await navigator.clipboard.writeText(props.command.command_id)
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

async function copyRaw() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(teData.value, null, 2))
  } catch {}
  showMenu.value = false
}

function inspectDevices() {
  ws.listCommandDevices(props.command.command_id)
  showMenu.value = false
}

function cancelCommand() {
  ws.sendCancelCommand(props.command.command_id)
  showMenu.value = false
}
</script>

<style scoped>
.command-entry {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.status {
  --status-color: var(--color-text-dim);
  --status-bg: rgba(127, 127, 127, 0.15);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
  background: var(--status-bg);
  color: var(--status-color);
}
.status .label {
  font-size: 11px;
}
.status .dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--status-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--status-color) 20%, transparent);
}

/* Status themes */
.status[data-status='Unsent'] {
  --status-color: #969696;
}
.status[data-status='Pending'] {
  --status-color: #ffb300;
}
.status[data-status='Malformed'] {
  --status-color: #ff4500;
}
.status[data-status='Running'] {
  --status-color: #0078ff;
}
.status[data-status='Succeeded'] {
  --status-color: #00c853;
}
.status[data-status='Failed'] {
  --status-color: #d50000;
}

/* Pulse animation for active states */
.status[data-status='Pending'] .dot,
.status[data-status='Running'] .dot {
  animation: pulse 1.2s infinite ease-in-out;
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.25);
    opacity: 0.8;
  }
}
</style>
