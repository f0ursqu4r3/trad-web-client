<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronDown, ChevronUp, XCircle } from 'lucide-vue-next'
import type { ChaseState } from '@/stores/devices'
import { MarketAction, type ChaseStatus } from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'
import { formatPrice, formatQty, formatSide, getPositionSideClass } from './utils'

const props = defineProps<{
  device: ChaseState
  deviceId?: string | null
  failureReason?: string | null
}>()

const ws = useWsStore()
const now = ref(Date.now())
const historyExpanded = ref(false)
const cancelRequested = ref(false)
const cancelError = ref<string | null>(null)
let clock: number | null = null
let cancelResetTimer: number | null = null

onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 1_000)
})

onUnmounted(() => {
  if (clock !== null) window.clearInterval(clock)
  if (cancelResetTimer !== null) window.clearTimeout(cancelResetTimer)
})

const statusLabel = computed(() =>
  props.device.status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
)
const actionLabel = computed(() =>
  props.device.market_action === MarketAction.Close ? 'Close' : 'Open',
)
const referenceLabel = computed(() => (props.device.order_side === 'Buy' ? 'Best Bid' : 'Best Ask'))
const referencePrice = computed(() =>
  props.device.order_side === 'Buy' ? props.device.latest_bid : props.device.latest_ask,
)
const bboAgeMs = computed(() =>
  props.device.latest_book_at
    ? Math.max(0, now.value - props.device.latest_book_at.getTime())
    : null,
)
const marketStale = computed(
  () => props.device.status === 'paused_stale_market' || (bboAgeMs.value ?? Infinity) > 1_000,
)
const fillProgress = computed(() => {
  if (props.device.total_base_qty <= 0) return 0
  return Math.min(100, Math.max(0, (props.device.filled_qty / props.device.total_base_qty) * 100))
})
const replacementCount = computed(() => Math.max(0, props.device.attempts.length - 1))
const displayedAttempts = computed(() =>
  historyExpanded.value ? props.device.attempts : props.device.attempts.slice(-1),
)
const canCancel = computed(
  () =>
    !!props.deviceId &&
    !['filled', 'canceled', 'expired', 'boundary_reached', 'failed'].includes(props.device.status),
)
const boundaryLabel = computed(() => {
  if (props.device.boundary.kind === 'basis_points') {
    const percent = props.device.boundary.value / 100
    return `${props.device.boundary.value.toLocaleString()} bps (${percent.toLocaleString(undefined, { maximumFractionDigits: 4 })}%)`
  }
  return `$${formatPrice(props.device.boundary.value)}`
})
const attachedProtectionLabel = computed(() => {
  const plan = props.device.attached_exit_plan
  if (!plan || (plan.take_profit == null && plan.stop_loss == null)) return 'None'
  const parts: string[] = []
  if (plan.take_profit != null) parts.push(`TP $${formatPrice(plan.take_profit)}`)
  if (plan.stop_loss != null) parts.push(`SL $${formatPrice(plan.stop_loss)}`)
  return parts.join(' / ')
})
const elapsedMs = computed(() => Math.max(0, now.value - props.device.created_at.getTime()))

function statusClass(status: ChaseStatus): string {
  if (status === 'filled') return 'pill pill-ok'
  if (
    status === 'failed' ||
    status === 'reconciliation_required' ||
    status === 'paused_stale_market'
  ) {
    return status === 'failed' ? 'pill pill-err' : 'pill pill-warn'
  }
  if (status === 'canceled' || status === 'expired' || status === 'boundary_reached') {
    return 'pill pill-warn'
  }
  return 'pill pill-info'
}

function fmtDate(value?: Date | string | null): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function fmtAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '-'
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

function cancelChase() {
  if (!canCancel.value || !props.deviceId || cancelRequested.value) return
  cancelRequested.value = true
  cancelError.value = null
  try {
    ws.sendUserCommand({ kind: 'CancelDevice', data: { device_id: props.deviceId } })
  } catch (error) {
    cancelRequested.value = false
    cancelError.value = error instanceof Error ? error.message : String(error)
    return
  }
  cancelResetTimer = window.setTimeout(() => {
    cancelRequested.value = false
    cancelResetTimer = null
  }, 3_000)
}

function requestedUnit(): string {
  if (props.device.quantity_mode === 'risk') return 'USDC risk'
  if (props.device.quantity_mode === 'notional') return 'USDC'
  return props.device.symbol
}

function formatBps(fraction: number): string {
  return `${(fraction * 10_000).toLocaleString(undefined, { maximumFractionDigits: 4 })} bps`
}
</script>

<template>
  <div class="space-y-4 p-3" data-testid="chase-device-details">
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <h3 class="m-0 text-sm font-mono text-primary">Chase Device</h3>
        <div class="flex items-center gap-2">
          <span class="pill pill-xs">{{ actionLabel }}</span>
          <span :class="statusClass(device.status)" class="text-[10px] px-2 py-1">
            {{ statusLabel }}
          </span>
        </div>
      </div>
      <div class="text-[11px] dim font-mono">
        {{ device.symbol }} • <span class="uppercase">{{ device.order_side }}</span> •
        <span :class="getPositionSideClass(device.position_side)">
          {{ formatSide(device.position_side) }}
        </span>
        • POST ONLY
        <span v-if="device.market_action === MarketAction.Close"> • REDUCE ONLY</span>
      </div>
    </div>

    <div
      v-if="marketStale"
      class="border border-[var(--color-warning)] p-2 text-[11px] text-[var(--color-warning)]"
      data-testid="chase-stale-warning"
    >
      Market book is stale. Repricing is paused; any confirmed resting post-only child remains live.
    </div>

    <div class="space-y-3">
      <h4 class="section-title">Execution</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Requested</dt>
          <dd class="m-0 font-mono text-primary">{{ device.quantity }} {{ requestedUnit() }}</dd>
        </div>
        <div>
          <dt class="dt-label">Normalized Quantity</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(device.total_base_qty) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Filled</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(device.filled_qty) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Remaining</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(device.remaining_qty) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Fill Progress</dt>
          <dd class="m-0 font-mono text-primary">{{ fillProgress.toFixed(2) }}%</dd>
        </div>
        <div>
          <dt class="dt-label">Replacements</dt>
          <dd class="m-0 font-mono text-primary">{{ replacementCount }}</dd>
        </div>
        <div v-if="device.builder_target_total_tenths_bps != null">
          <dt class="dt-label">Pinned All-in Target / Side</dt>
          <dd class="m-0 font-mono text-primary">
            {{ (device.builder_target_total_tenths_bps / 10).toFixed(1) }} bps
          </dd>
        </div>
        <template v-if="device.risk_sizing">
          <div>
            <dt class="dt-label">Risk Stop</dt>
            <dd class="m-0 font-mono text-primary">
              ${{ formatPrice(device.risk_sizing.stop_loss_price) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Quantity Step</dt>
            <dd class="m-0 font-mono text-primary">
              {{ formatQty(device.risk_sizing.quantity_step) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Entry Cost Assumption</dt>
            <dd class="m-0 font-mono text-primary">
              {{ formatBps(device.risk_sizing.entry_fee_fraction) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Exit Cost Assumption</dt>
            <dd class="m-0 font-mono text-primary">
              {{ formatBps(device.risk_sizing.exit_fee_fraction) }}
            </dd>
          </div>
        </template>
      </div>
    </div>

    <div class="space-y-3">
      <h4 class="section-title">Book And Price</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Reference</dt>
          <dd class="m-0 font-mono text-primary">{{ referenceLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Reference Price</dt>
          <dd class="m-0 font-mono text-primary">
            {{ referencePrice == null ? '-' : `$${formatPrice(referencePrice)}` }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Best Bid / Ask</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.latest_bid == null ? '-' : formatPrice(device.latest_bid) }} /
            {{ device.latest_ask == null ? '-' : formatPrice(device.latest_ask) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Book Age</dt>
          <dd
            class="m-0 font-mono"
            :class="marketStale ? 'text-[var(--color-warning)]' : 'text-primary'"
          >
            {{ fmtAge(bboAgeMs) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Desired Price</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.desired_price == null ? '-' : `$${formatPrice(device.desired_price)}` }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Working Price</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.working_price == null ? '-' : `$${formatPrice(device.working_price)}` }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Last Book</dt>
          <dd class="m-0 font-mono text-primary">{{ fmtDate(device.latest_book_at) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Last Reprice</dt>
          <dd class="m-0 font-mono text-primary">{{ fmtDate(device.last_reprice_at) }}</dd>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <h4 class="section-title">Boundary And Lifetime</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Configured Boundary</dt>
          <dd class="m-0 font-mono text-primary">{{ boundaryLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Resolved Boundary Price</dt>
          <dd class="m-0 font-mono text-primary">
            {{
              device.boundary_price > 0
                ? `$${formatPrice(device.boundary_price)}`
                : 'Waiting for book'
            }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Elapsed</dt>
          <dd class="m-0 font-mono text-primary">{{ fmtAge(elapsedMs) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Deadline</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.expires_at ? fmtDate(device.expires_at) : 'Until canceled' }}
          </dd>
        </div>
        <div v-if="device.retry_not_before">
          <dt class="dt-label">Retry Not Before</dt>
          <dd class="m-0 font-mono text-primary">{{ fmtDate(device.retry_not_before) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Replacement Pending</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.replacement_pending ? 'Yes' : 'No' }}
          </dd>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <h4 class="section-title">Protection</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Attached Plan</dt>
          <dd class="m-0 font-mono text-primary">{{ attachedProtectionLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Coverage Authority</dt>
          <dd class="m-0 font-mono text-primary">Child protection devices</dd>
        </div>
      </div>
      <p v-if="device.attached_exit_plan" class="m-0 text-[11px] text-[var(--color-text-dim)]">
        Expand completed Order attempts in the device tree to inspect authoritative NativeProtection
        coverage for each established fill.
      </p>
    </div>

    <div class="space-y-3">
      <button
        type="button"
        class="flex w-full items-center justify-between border-0 bg-transparent p-0 text-left section-title"
        :title="historyExpanded ? 'Collapse replacement history' : 'Expand replacement history'"
        @click="historyExpanded = !historyExpanded"
      >
        <span>Replacement History ({{ device.attempts.length }})</span>
        <ChevronUp v-if="historyExpanded" :size="14" />
        <ChevronDown v-else :size="14" />
      </button>
      <p v-if="device.attempts.length === 0" class="m-0 text-[11px] dim">
        No working order has been submitted yet.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-[11px] font-mono" data-testid="chase-attempt-history">
          <thead class="dim">
            <tr>
              <th class="py-1 pr-3">Attempt</th>
              <th class="py-1 pr-3">Price</th>
              <th class="py-1 pr-3">Filled / Qty</th>
              <th class="py-1 pr-3">Status</th>
              <th class="py-1 pr-3">Reason</th>
              <th class="py-1">Client ID</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="attempt in displayedAttempts"
              :key="attempt.child_device_id"
              class="border-t border-[var(--border-color)]"
            >
              <td class="py-1 pr-3">#{{ attempt.sequence }}</td>
              <td class="py-1 pr-3">${{ formatPrice(attempt.price) }}</td>
              <td class="py-1 pr-3">
                {{ formatQty(attempt.filled_qty) }} / {{ formatQty(attempt.requested_qty) }}
              </td>
              <td class="py-1 pr-3">{{ attempt.status.replace(/_/g, ' ') }}</td>
              <td class="min-w-48 py-1 pr-3 text-[10px] whitespace-normal">
                {{ attempt.reason || '-' }}
              </td>
              <td class="py-1 text-[10px] break-all">{{ attempt.client_order_id }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="device.current_client_order_id || device.last_reason" class="space-y-3">
      <h4 class="section-title">Latest State</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div v-if="device.current_client_order_id">
          <dt class="dt-label">Current Client ID</dt>
          <dd class="m-0 font-mono text-[10px] text-primary break-all">
            {{ device.current_client_order_id }}
          </dd>
        </div>
        <div v-if="device.pending_terminal_status">
          <dt class="dt-label">Pending Terminal State</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.pending_terminal_status.replace(/_/g, ' ') }}
          </dd>
        </div>
      </div>
      <p v-if="device.last_reason" class="m-0 font-mono text-[11px] text-primary break-words">
        {{ device.last_reason }}
      </p>
    </div>

    <div v-if="failureReason" class="border border-[var(--color-error)] p-2 text-[11px] text-error">
      {{ failureReason }}
    </div>

    <div v-if="canCancel" class="space-y-2 border-t border-[var(--border-color)] pt-3">
      <button
        type="button"
        class="btn btn-danger inline-flex items-center gap-2"
        :disabled="cancelRequested"
        @click="cancelChase"
      >
        <XCircle :size="14" />
        {{ cancelRequested ? 'Cancel requested' : 'Cancel Chase' }}
      </button>
      <p v-if="cancelError" class="m-0 text-[11px] text-error">{{ cancelError }}</p>
    </div>
  </div>
</template>
