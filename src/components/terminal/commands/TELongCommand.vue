<script lang="ts" setup>
import type { TrailingEntryOrderCommand } from '@/lib/ws/protocol'
import { formatNumberShort, formatUsdShort } from '@/lib/numberFormat'

defineProps<{ command: TrailingEntryOrderCommand }>()

function fmtUsd(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return formatUsdShort(n)
}

function fmtPrice(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return formatNumberShort(n, { minDecimals: 2, maxDecimals: 6 })
}

function fmtPct(n?: number) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(
    n / 100,
  )
}

function fmtSplitSummary(split?: TrailingEntryOrderCommand['split_settings']) {
  if (!split) return 'Default'
  const parts = []
  if (split.target_child_notional != null) {
    parts.push(`target $${fmtPrice(split.target_child_notional)}`)
  }
  if (split.max_splits_cap != null) {
    parts.push(`cap ${split.max_splits_cap}`)
  }
  if (split.mode) {
    parts.push(split.mode === 'max_splits' ? 'max splits' : 'prefer target')
  }
  if (split.slippage_margin != null) {
    parts.push(
      new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(
        split.slippage_margin,
      ),
    )
  }
  return parts.length ? parts.join(' · ') : 'Default'
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
        Activation
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtPrice(command.activation_price) }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Jump Frac
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtPct(command.jump_frac_threshold) }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Stop Loss
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtPrice(command.stop_loss) }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Risk
      </dt>
      <dd class="m-0 text-[12px]">{{ fmtUsd(command.risk_amount) }}</dd>
    </div>

    <div class="sm:col-span-2">
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Splits
      </dt>
      <dd class="m-0 text-[12px] font-mono text-[var(--color-text-dim)]">
        {{ fmtSplitSummary(command.split_settings) }}
      </dd>
    </div>
  </dl>
</template>
