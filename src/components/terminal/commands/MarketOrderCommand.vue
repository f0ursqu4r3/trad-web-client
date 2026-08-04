<script lang="ts" setup>
import type { MarketOrderCommand, MarketRef } from '@/lib/ws/protocol'
import { formatUsdShort } from '@/lib/numberFormat'
import { formatMarketContext, formatMarketRef } from '@/lib/marketContext'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{
  command: MarketOrderCommand
  marketRef?: MarketRef | null
}>()

const accountsStore = useAccountsStore()

function fmtUsd(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return formatUsdShort(n)
}

function quantityLabel(command: MarketOrderCommand) {
  if (command.quantity_mode === 'base') return 'Base Quantity'
  if (command.quantity_mode === 'risk') return 'Risk at Stop'
  return 'Notional'
}

function fmtQuantity(command: MarketOrderCommand) {
  if (command.quantity_mode === 'base') {
    return command.quantity.toLocaleString(undefined, { maximumFractionDigits: 12 })
  }
  return fmtUsd(command.quantity)
}

function fmtPrice(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 8 })}`
}

function titleCase(s?: string) {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function fmtMarketContext(command: MarketOrderCommand) {
  const refLabel = formatMarketRef(props.marketRef)
  if (refLabel) return refLabel
  return formatMarketContext(command.market_context, accountsStore.accounts)
}
</script>

<template>
  <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 m-0">
    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Symbol
      </dt>
      <dd class="m-0 text-[12px] font-mono">{{ command.symbol }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Action
      </dt>
      <dd class="m-0 text-[12px]">{{ titleCase(command.action) }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        {{ quantityLabel(command) }}
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtQuantity(command) }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Position Side
      </dt>
      <dd class="m-0 text-[12px]">{{ command.position_side }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Context
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtMarketContext(command) }}</dd>
    </div>

    <template v-if="command.attached_exit_plan">
      <div>
        <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
          Take Profit
        </dt>
        <dd v-if="command.attached_exit_plan.take_profit_ladder" class="m-0 text-[12px] space-y-1">
          <div v-for="leg in command.attached_exit_plan.take_profit_ladder.legs" :key="leg.leg_id">
            {{ fmtPrice(leg.trigger_price) }} ·
            {{ leg.allocation.kind === 'fraction' ? `${leg.allocation.value * 100}%` : `${leg.allocation.value} base` }}
          </div>
        </dd>
        <dd v-else class="m-0 text-[12px]">{{ fmtPrice(command.attached_exit_plan.take_profit) }}</dd>
      </div>

      <div>
        <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
          Stop Loss
        </dt>
        <dd class="m-0 text-[12px]">{{ fmtPrice(command.attached_exit_plan.stop_loss) }}</dd>
      </div>
    </template>
  </dl>
</template>
