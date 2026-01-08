<script lang="ts" setup>
import type { TrailingEntryOrderCommand } from '@/lib/ws/protocol'

defineProps<{ command: TrailingEntryOrderCommand }>()

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
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(
    n / 100,
  )
}
</script>

<template>
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
</template>
