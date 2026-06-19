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
        Quantity (USD)
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtUsd(command.quantity_usd) }}</dd>
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
        <dd class="m-0 text-[12px]">{{ fmtPrice(command.attached_exit_plan.take_profit) }}</dd>
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
