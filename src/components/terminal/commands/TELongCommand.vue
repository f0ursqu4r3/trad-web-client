<template>
  <div class="command-entry panel crt-overlay">
    <div class="panel-header header">
      <div class="title">
        <span class="badge kind">TE‑LONG</span>
        <span class="name mono">{{ command.name }}</span>
        <span
          class="id mono dim copyable"
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
      <div class="right">
        <button
          class="icon-btn"
          :title="expanded ? 'Collapse' : 'Expand'"
          @click="expanded = !expanded"
          aria-label="Toggle details"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline :points="expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'" />
          </svg>
        </button>
        <div class="status" :data-status="command.status" :aria-label="command.status">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">{{ command.status }}</span>
        </div>
        <div class="menu-wrapper">
          <button
            class="icon-btn"
            title="More actions"
            aria-haspopup="menu"
            :aria-expanded="showMenu ? 'true' : 'false'"
            @click="toggleMenu"
            @keydown.enter.prevent="toggleMenu"
            @keydown.space.prevent="toggleMenu"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="5" cy="12" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
            </svg>
          </button>
          <ul v-if="showMenu" class="menu" role="menu" @mouseleave="showMenu = false">
            <li role="menuitem" @click="copyRaw">Copy raw command</li>
            <li role="menuitem" @click="inspectDevices">Inspect devices</li>
            <li
              role="menuitem"
              :class="{ disabled: !canCancel }"
              @click="canCancel && cancelCommand()"
            >
              Cancel command
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="body">
      <div v-if="expanded" class="raw">
        <div class="raw-label">Raw</div>
        <pre class="raw-text mono">{{ command.text }}</pre>
      </div>
      <dl class="kv-grid">
        <div class="kv">
          <dt>Symbol</dt>
          <dd class="mono">{{ args.symbol }}</dd>
        </div>
        <div class="kv">
          <dt>Activation</dt>
          <dd>{{ fmtPrice(args.activationPrice) }}</dd>
        </div>
        <div class="kv">
          <dt>Jump Frac</dt>
          <dd>{{ fmtPct(args.jumpFractionThreshold) }}</dd>
        </div>
        <div class="kv">
          <dt>Stop Loss</dt>
          <dd>{{ fmtPrice(args.stopLoss) }}</dd>
        </div>
        <div class="kv">
          <dt>Risk</dt>
          <dd>{{ fmtUsd(args.riskAmount) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import type { CommandHistoryItem } from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

const props = defineProps<{
  command: CommandHistoryItem
}>()

const args = computed(() => {
  const parts = props.command.text.split(' ')
  // symbol activation_price jump_frac_threshold stop_loss risk_amount
  return {
    symbol: parts[1],
    activationPrice: parseFloat(parts[2]),
    jumpFractionThreshold: parseFloat(parts[3]),
    stopLoss: parseFloat(parts[4]),
    riskAmount: parseFloat(parts[5]),
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
    await navigator.clipboard.writeText(props.command.text)
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

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 32px;
}

.title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.badge.kind {
  text-transform: uppercase;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-color) 40%, transparent);
  padding: 2px 6px;
  border-radius: 999px;
}

.name {
  font-size: 11px;
}

.id {
  font-size: 10px;
}

.copyable {
  cursor: pointer;
  user-select: text;
}
.copyable:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
  border-radius: 2px;
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

.body {
  padding: 8px;
}

.raw {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.raw-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-dim);
  padding-top: 2px;
}
.raw-text {
  margin: 0;
  padding: 6px 8px;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  background: var(--panel-bg);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.kv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px 16px;
  margin: 0;
}
.kv dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-dim);
  margin: 0 0 2px 0;
}
.kv dd {
  margin: 0;
  font-size: 12px;
}

.mono {
  font-size: 11px;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: inherit;
  border-radius: 4px;
  padding: 2px 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover {
  filter: brightness(1.1);
}
.icon-btn:active {
  filter: brightness(0.95);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.menu-wrapper {
  position: relative;
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  z-index: 5;
}
.menu li {
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}
.menu li:hover {
  background: var(--panel-header-bg);
}
.menu li.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
