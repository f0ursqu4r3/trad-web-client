<script setup lang="ts">
import { computed } from 'vue'
import type { MarketOrderState } from '@/stores/devices'
import { MarketAction, MarketOrderStatus } from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { formatPrice, formatQty, getPositionSideClass, formatSide } from './utils'

const props = defineProps<{
  device: MarketOrderState
  failureReason?: string | null
}>()
const accounts = useAccountsStore()

const networkLabel = computed(() => {
  const ctx = props.device.market_context
  if (ctx.type === 'binance' || ctx.type === 'bifake') {
    const account = accounts.accounts.find((item) => item.id === ctx.account_id)
    return account?.network ?? '-'
  }
  return '-'
})

const actionLabel = computed(() => {
  return props.device.market_action === MarketAction.Close ? 'Close' : 'Open'
})

function getStatusClass(status: MarketOrderStatus): string {
  switch (status) {
    case MarketOrderStatus.Filled:
      return 'pill pill-ok'
    case MarketOrderStatus.PartiallyFilled:
      return 'pill pill-info'
    case MarketOrderStatus.AlreadySentAndAwaitingFilling:
      return 'pill pill-info'
    case MarketOrderStatus.NotYetSent:
      return 'pill'
    case MarketOrderStatus.Canceled:
      return 'pill pill-warn'
    case MarketOrderStatus.Rejected:
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
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Header -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-[var(--color-text)] m-0">Market Order Device</h3>
        <div class="flex items-center gap-2">
          <span class="pill pill-xs">{{ actionLabel }}</span>
          <span :class="getStatusClass(device.status)" class="text-[10px] px-2 py-1">
            {{ device.status }}
          </span>
        </div>
      </div>
      <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
        {{ device.symbol }} • <span class="uppercase">{{ device.order_side }}</span> •
        <span :class="getPositionSideClass(device.position_side)">{{
          formatSide(device.position_side)
        }}</span>
      </div>
    </div>

    <!-- Parameters -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Parameters
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Quantity
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ formatQty(device.quantity) }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Price
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">${{ formatPrice(device.price) }}</dd>
        </div>
      </div>
    </div>

    <!-- Identifiers & Timing -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Order Info
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Client Order ID
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)] text-[10px]">
            {{ device.client_order_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Remote ID
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.remote_id ?? '-' }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Sent At
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ fmtDate(device.sent_at) }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Last Status Check
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ fmtDate(device.last_status_check_at) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Last Update Seen
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ fmtDate(device.last_update_seen_at) }}
          </dd>
        </div>
      </div>
    </div>

    <div
      v-if="failureReason"
      class="space-y-2 rounded-md border border-[var(--border-color)] bg-[var(--color-surface-alt)] p-2"
    >
      <h4 class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0">
        Rejection Reason
      </h4>
      <p class="m-0 text-[12px] font-mono text-[var(--color-text)] break-words">
        {{ failureReason }}
      </p>
    </div>

    <!-- Market Context -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Market Context
      </h4>
      <div class="text-[12px]">
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
              Type
            </dt>
            <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.market_context.type }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
              Network
            </dt>
            <dd class="m-0 font-mono text-[var(--color-text)]">{{ networkLabel }}</dd>
          </div>
        </div>
        <div
          v-if="
            (device.market_context.type === 'binance' ||
              device.market_context.type === 'bifake') &&
            'account_id' in device.market_context
          "
        >
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Account ID
          </dt>
          <dd class="m-0 font-mono text-[10px] text-[var(--color-text-dim)]">
            {{ device.market_context.account_id.slice(0, 8) }}...
          </dd>
        </div>
        <div
          v-if="device.market_context.type === 'sim' && 'sim_market_id' in device.market_context"
          class="mt-1"
        >
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Sim Market ID
          </dt>
          <dd class="m-0 font-mono text-[10px] text-[var(--color-text-dim)]">
            {{ device.market_context.sim_market_id.slice(0, 8) }}...
          </dd>
        </div>
      </div>
    </div>
  </div>
</template>
