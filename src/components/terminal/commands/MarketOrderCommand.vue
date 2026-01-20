<script lang="ts" setup>
import type { MarketOrderCommand, MarketContext } from '@/lib/ws/protocol'
import { formatUsdShort } from '@/lib/numberFormat'

defineProps<{
  command: MarketOrderCommand
}>()

function fmtUsd(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return formatUsdShort(n)
}

function titleCase(s?: string) {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function fmtMarketContext(mc: MarketContext) {
  switch (mc.type) {
    case 'none':
      return 'None'
    case 'binance':
      return `Binance • ${mc.account_id}`
    case 'sim':
      return `Sim • ${mc.sim_market_id}`
    default:
      return 'Unknown'
  }
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
      <dd class="m-0 text-[12px]">{{ fmtMarketContext(command.market_context) }}</dd>
    </div>
  </dl>
</template>
