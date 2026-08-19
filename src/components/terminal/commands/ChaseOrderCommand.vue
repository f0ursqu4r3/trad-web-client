<script setup lang="ts">
import type { ChaseOrderCommand, MarketRef } from '@/lib/ws/protocol'
import { formatMarketContext, formatMarketRef } from '@/lib/marketContext'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{
  command: ChaseOrderCommand
  marketRef?: MarketRef | null
}>()

const accounts = useAccountsStore()

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function formatNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function formatAmount(): string {
  const suffix =
    props.command.quantity_mode === 'risk'
      ? 'USDC risk'
      : props.command.quantity_mode === 'notional'
        ? 'USDC'
        : props.command.symbol
  return `${formatNumber(props.command.quantity)} ${suffix}`
}

function formatBoundary(): string {
  if (props.command.boundary.kind === 'price') {
    return `$${formatNumber(props.command.boundary.value)} fixed`
  }
  return `${formatNumber(props.command.boundary.value)} bps (${formatNumber(props.command.boundary.value / 100)}%)`
}

function formatExpiry(): string {
  if (props.command.expires_after_secs == null) return 'Until canceled'
  const seconds = props.command.expires_after_secs
  if (seconds < 60) return `${seconds}s`
  const minutes = seconds / 60
  return `${formatNumber(minutes)}m`
}

function formatContext(): string {
  return (
    formatMarketRef(props.marketRef) ??
    formatMarketContext(props.command.market_context, accounts.accounts)
  )
}
</script>

<template>
  <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 m-0">
    <div>
      <dt class="dt-label">Symbol</dt>
      <dd class="m-0 text-[12px] font-mono">{{ command.symbol }}</dd>
    </div>
    <div>
      <dt class="dt-label">Action</dt>
      <dd class="m-0 text-[12px]">{{ titleCase(command.action) }}</dd>
    </div>
    <div>
      <dt class="dt-label">Position Side</dt>
      <dd class="m-0 text-[12px]">{{ titleCase(command.position_side) }}</dd>
    </div>
    <div>
      <dt class="dt-label">Order Side</dt>
      <dd class="m-0 text-[12px]">{{ titleCase(command.side) }} post-only</dd>
    </div>
    <div>
      <dt class="dt-label">Requested Amount</dt>
      <dd class="m-0 text-[12px] font-mono">{{ formatAmount() }}</dd>
    </div>
    <div>
      <dt class="dt-label">Maximum Chase</dt>
      <dd class="m-0 text-[12px] font-mono">{{ formatBoundary() }}</dd>
    </div>
    <div>
      <dt class="dt-label">Expiry</dt>
      <dd class="m-0 text-[12px]">{{ formatExpiry() }}</dd>
    </div>
    <div>
      <dt class="dt-label">Context</dt>
      <dd class="m-0 text-[12px]">{{ formatContext() }}</dd>
    </div>
    <template v-if="command.attached_exit_plan">
      <div>
        <dt class="dt-label">Take Profit</dt>
        <dd
          v-if="command.attached_exit_plan.take_profit_ladder"
          class="m-0 text-[12px] font-mono space-y-1"
        >
          <div v-for="leg in command.attached_exit_plan.take_profit_ladder.legs" :key="leg.leg_id">
            ${{ formatNumber(leg.trigger_price) }} ·
            {{
              leg.allocation.kind === 'fraction'
                ? `${leg.allocation.value * 100}%`
                : `${leg.allocation.value} base`
            }}
          </div>
        </dd>
        <dd v-else class="m-0 text-[12px] font-mono">
          {{
            command.attached_exit_plan.take_profit == null
              ? '-'
              : `$${formatNumber(command.attached_exit_plan.take_profit)}`
          }}
        </dd>
      </div>
      <div>
        <dt class="dt-label">Stop Loss</dt>
        <dd class="m-0 text-[12px] font-mono">
          {{
            command.attached_exit_plan.stop_loss == null
              ? '-'
              : `$${formatNumber(command.attached_exit_plan.stop_loss)}`
          }}
        </dd>
      </div>
    </template>
  </dl>
</template>
