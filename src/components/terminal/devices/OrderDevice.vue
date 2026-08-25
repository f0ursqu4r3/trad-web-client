<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { OrderState } from '@/stores/devices'
import { MarketAction, OrderStatus, type MarketRef, type ProtectionState } from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import { normalizeMarketContext } from '@/lib/marketContext'
import { formatPrice, formatQty, getPositionSideClass, formatSide } from './utils'
import { formatExecutionGuardPercent } from '@/lib/hyperliquidExecutionGuards'
import { XCircle } from 'lucide-vue-next'
import ExecutionFillsPanel from './ExecutionFillsPanel.vue'

const props = defineProps<{
  device: OrderState
  marketRef?: MarketRef | null
  protectionState?: ProtectionState | null
  failureReason?: string | null
  createdAt?: Date | null
  deviceId?: string | null
}>()
const accounts = useAccountsStore()
const ws = useWsStore()
const cancelRequested = ref(false)
const cancelError = ref<string | null>(null)
let cancelResetTimer: number | null = null
const normalizedMarketContext = computed(() => normalizeMarketContext(props.device.market_context))

const networkLabel = computed(() => {
  const ctx = normalizedMarketContext.value
  if (
    ctx.type === 'binance' ||
    ctx.type === 'bifake' ||
    ctx.type === 'bybit' ||
    ctx.type === 'hyperliquid'
  ) {
    const account = accounts.accounts.find((item) => item.id === ctx.account_id)
    return account?.network ?? '-'
  }
  return '-'
})

const actionLabel = computed(() => {
  return props.device.market_action === MarketAction.Close ? 'Close' : 'Open'
})
const isLimitOrder = computed(() => props.device.execution.kind === 'limit')
const canCancelLimitOrder = computed(
  () =>
    isLimitOrder.value &&
    !!props.deviceId &&
    [
      OrderStatus.NotYetSent,
      OrderStatus.AlreadySentAndAwaitingFilling,
      OrderStatus.PartiallyFilled,
      OrderStatus.ReconciliationRequired,
    ].includes(props.device.status),
)
const deviceTitle = computed(() =>
  isLimitOrder.value ? 'Limit Order Device' : 'Market Order Device',
)
const timeInForceLabel = computed(() => {
  if (props.device.execution.kind !== 'limit') return null
  return props.device.execution.time_in_force === 'alo' ? 'Post Only (ALO)' : 'Good Till Canceled'
})
const filledQuantity = computed(() => Math.max(props.device.filled_qty ?? 0, 0))
const remainingQuantity = computed(() => Math.max(props.device.quantity - filledQuantity.value, 0))
const fillProgressLabel = computed(() => {
  if (props.device.quantity <= 0) return '-'
  const percent = Math.min((filledQuantity.value / props.device.quantity) * 100, 100)
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
})

function getStatusClass(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.Filled:
      return 'pill pill-ok'
    case OrderStatus.PartiallyFilled:
      return 'pill pill-info'
    case OrderStatus.AlreadySentAndAwaitingFilling:
      return 'pill pill-info'
    case OrderStatus.ReconciliationRequired:
      return 'pill pill-warn'
    case OrderStatus.NotYetSent:
      return 'pill'
    case OrderStatus.Canceled:
      return 'pill pill-warn'
    case OrderStatus.Rejected:
      return 'pill pill-err'
    default:
      return 'pill'
  }
}

// side helpers imported from ./utils

function fmtDate(d?: Date | null): string {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return '-'
  }
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    const digits = totalSeconds < 10 ? 1 : 0
    return `${totalSeconds.toFixed(digits)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

const throttleDelayLabel = computed(() => {
  if (!props.device.throttle) return null
  const createdAt = props.createdAt
  const sentAt = props.device.sent_at
  if (!createdAt || !sentAt) return 'Queued'
  const diffMs = sentAt.getTime() - createdAt.getTime()
  if (diffMs < 0) return 'Queued'
  return `Queued ${formatDuration(diffMs)}`
})

const oneWayEffectLabel = computed(() => {
  const effect = props.device.one_way_position_effect
  if (!effect) return null
  return effect.opened_quantity > 1e-12 ? 'Reversal' : 'Reduction only'
})
const openSemanticsLabel = computed(() =>
  props.device.one_way_open_semantics === 'target_side_exposure'
    ? 'Target side exposure'
    : 'Buy/sell delta',
)

const baselineSideLabel = computed(() => {
  const quantity = props.device.one_way_position_effect?.baseline_signed_quantity ?? 0
  if (quantity > 0) return 'Long'
  if (quantity < 0) return 'Short'
  return 'Flat'
})

const transitionPhaseLabel = computed(() => {
  const phase = props.device.one_way_transition?.phase
  if (!phase) return null
  return phase.replace(/_/g, ' ')
})

function cancelLimitOrder() {
  if (!canCancelLimitOrder.value || !props.deviceId || cancelRequested.value) return
  cancelRequested.value = true
  cancelError.value = null
  try {
    ws.sendUserCommand({
      kind: 'CancelDevice',
      data: { device_id: props.deviceId },
    })
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

onUnmounted(() => {
  if (cancelResetTimer !== null) window.clearTimeout(cancelResetTimer)
})
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Header -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-primary m-0">{{ deviceTitle }}</h3>
        <div class="flex items-center gap-2">
          <span class="pill pill-xs">{{ actionLabel }}</span>
          <span
            v-if="device.one_way_open_semantics === 'target_side_exposure'"
            class="pill pill-xs pill-info"
          >
            TE exposure target
          </span>
          <span v-if="device.throttle" class="pill pill-xs pill-warn">Throttled</span>
          <span :class="getStatusClass(device.status)" class="text-[10px] px-2 py-1">
            {{ device.status }}
          </span>
        </div>
      </div>
      <div class="text-[11px] dim font-mono">
        {{ device.symbol }} • <span class="uppercase">{{ device.order_side }}</span> •
        <span :class="getPositionSideClass(device.position_side)">{{
          formatSide(device.position_side)
        }}</span>
      </div>
      <div v-if="device.execution_guards" class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div v-if="!isLimitOrder">
          <dt class="dt-label">Market Execution Guard</dt>
          <dd class="m-0 font-mono text-primary">
            {{ formatExecutionGuardPercent(device.execution_guards.entry_market_tenths_bps) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">TP Market Guard</dt>
          <dd class="m-0 font-mono text-primary">
            {{ formatExecutionGuardPercent(device.execution_guards.take_profit_market_tenths_bps) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">SL Market Guard</dt>
          <dd class="m-0 font-mono text-primary">
            {{ formatExecutionGuardPercent(device.execution_guards.stop_loss_market_tenths_bps) }}
          </dd>
        </div>
      </div>
    </div>

    <!-- Parameters -->
    <div class="space-y-3">
      <h4 class="section-title">Parameters</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Quantity</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(device.quantity) }}</dd>
        </div>
        <div v-if="isLimitOrder || device.filled_qty != null">
          <dt class="dt-label">Filled Quantity</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(filledQuantity) }}</dd>
        </div>
        <div v-if="isLimitOrder">
          <dt class="dt-label">Remaining Quantity</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(remainingQuantity) }}</dd>
        </div>
        <div v-if="isLimitOrder">
          <dt class="dt-label">Fill Progress</dt>
          <dd class="m-0 font-mono text-primary">{{ fillProgressLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">{{ isLimitOrder ? 'Limit Price' : 'Decision Price' }}</dt>
          <dd class="m-0 font-mono text-primary">${{ formatPrice(device.price) }}</dd>
        </div>
        <div v-if="timeInForceLabel">
          <dt class="dt-label">Time in Force</dt>
          <dd class="m-0 font-mono text-primary">{{ timeInForceLabel }}</dd>
        </div>
        <div v-if="device.execution.kind === 'limit'">
          <dt class="dt-label">Requested Amount</dt>
          <dd class="m-0 font-mono text-primary">
            {{ device.execution.input_value }}
            {{ device.execution.input_mode === 'notional' ? 'USDC' : device.symbol }}
          </dd>
        </div>
        <div v-if="device.builder_target_total_tenths_bps != null">
          <dt class="dt-label">Pinned All-in Target / Side</dt>
          <dd class="m-0 font-mono text-primary">
            {{ (device.builder_target_total_tenths_bps / 10).toFixed(1) }} bps
          </dd>
        </div>
      </div>
    </div>

    <ExecutionFillsPanel :fills="device.execution_fills ?? []" />

    <div v-if="device.one_way_position_effect" class="space-y-3">
      <h4 class="section-title">One-Way Net Effect</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Outcome</dt>
          <dd class="m-0 font-mono text-primary">{{ oneWayEffectLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Open Semantics</dt>
          <dd class="m-0 font-mono text-primary">{{ openSemanticsLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Baseline</dt>
          <dd class="m-0 font-mono text-primary">
            {{ baselineSideLabel }}
            {{ formatQty(Math.abs(device.one_way_position_effect.baseline_signed_quantity)) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Reduced</dt>
          <dd class="m-0 font-mono text-primary">
            {{ formatQty(device.one_way_position_effect.reduced_quantity) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Opened Residual</dt>
          <dd class="m-0 font-mono text-primary">
            {{ formatQty(device.one_way_position_effect.opened_quantity) }}
          </dd>
        </div>
      </div>
      <div v-if="device.one_way_transition" class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Transition Phase</dt>
          <dd class="m-0 font-mono text-primary capitalize">{{ transitionPhaseLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Working Client ID</dt>
          <dd class="m-0 font-mono text-primary text-[10px] break-all">
            {{ device.one_way_transition.working_client_order_id }}
          </dd>
        </div>
      </div>
    </div>

    <!-- Identifiers & Timing -->
    <div class="space-y-3">
      <h4 class="section-title">Order Info</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Client Order ID</dt>
          <dd class="m-0 font-mono text-primary text-[10px]">
            {{ device.client_order_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Remote Order ID</dt>
          <dd class="m-0 font-mono text-primary text-[10px]">
            {{ device.remote_order_id || device.remote_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Sent At</dt>
          <dd class="m-0 font-mono text-primary">{{ fmtDate(device.sent_at) }}</dd>
        </div>
        <div v-if="device.throttle">
          <dt class="dt-label">Throttle Delay</dt>
          <dd class="m-0 font-mono text-primary">{{ throttleDelayLabel }}</dd>
        </div>
        <div>
          <dt class="dt-label">Last Status Check</dt>
          <dd class="m-0 font-mono text-primary">
            {{ fmtDate(device.last_status_check_at) }}
          </dd>
        </div>
        <div>
          <dt class="dt-label">Last Update Seen</dt>
          <dd class="m-0 font-mono text-primary">
            {{ fmtDate(device.last_update_seen_at) }}
          </dd>
        </div>
      </div>
    </div>

    <div
      v-if="failureReason"
      class="space-y-2 border border-[var(--border-color)] bg-[var(--color-surface-alt)] p-2"
      :style="{ borderRadius: 'var(--radius-base)' }"
    >
      <h4 class="text-[11px] uppercase tracking-wide dim m-0">Rejection Reason</h4>
      <p class="m-0 text-[12px] font-mono text-primary break-words">
        {{ failureReason }}
      </p>
    </div>

    <div v-if="canCancelLimitOrder" class="space-y-2 border-t border-[var(--border-color)] pt-3">
      <button
        type="button"
        class="btn btn-danger inline-flex items-center gap-2"
        :disabled="cancelRequested"
        @click="cancelLimitOrder"
      >
        <XCircle :size="14" />
        {{ cancelRequested ? 'Cancel requested' : 'Cancel limit order' }}
      </button>
      <p v-if="cancelError" class="m-0 text-[11px] text-error">{{ cancelError }}</p>
    </div>

    <!-- Market Context -->
    <div class="space-y-3">
      <h4 class="section-title">Market Context</h4>
      <div class="text-[12px]">
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt class="dt-label">Type</dt>
            <dd class="m-0 font-mono text-primary">{{ normalizedMarketContext.type }}</dd>
          </div>
          <div>
            <dt class="dt-label">Network</dt>
            <dd class="m-0 font-mono text-primary">{{ networkLabel }}</dd>
          </div>
        </div>
        <div
          v-if="
            (normalizedMarketContext.type === 'binance' ||
              normalizedMarketContext.type === 'bifake' ||
              normalizedMarketContext.type === 'bybit' ||
              normalizedMarketContext.type === 'hyperliquid') &&
            'account_id' in normalizedMarketContext
          "
        >
          <dt class="dt-label">Account ID</dt>
          <dd class="m-0 font-mono text-[10px] dim">
            {{ normalizedMarketContext.account_id.slice(0, 8) }}...
          </dd>
        </div>
        <div
          v-if="
            normalizedMarketContext.type === 'sim' && 'sim_market_id' in normalizedMarketContext
          "
          class="mt-1"
        >
          <dt class="dt-label">Sim Market ID</dt>
          <dd class="m-0 font-mono text-[10px] dim">
            {{ normalizedMarketContext.sim_market_id.slice(0, 8) }}...
          </dd>
        </div>
      </div>
    </div>
  </div>
</template>
