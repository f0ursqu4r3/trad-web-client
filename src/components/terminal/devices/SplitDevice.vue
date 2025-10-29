<script setup lang="ts">
import type { SplitState } from '@/stores/devices'

defineProps<{
  device: SplitState
}>()

function formatPrice(price: number): string {
  return price.toFixed(2)
}

function formatQty(qty: number): string {
  // Show up to 6 decimals for crypto-style quantities
  return qty.toLocaleString(undefined, { maximumFractionDigits: 6 })
}
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Header -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-[var(--color-text)] m-0">Split Device</h3>
      </div>
      <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
        {{ device.symbol }}
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
  </div>
</template>
