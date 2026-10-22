<script setup lang="ts">
import { computed } from 'vue'

import { marketSymbolParts } from '@/lib/hyperliquidMarkets'

// A market as traders know it: `XYZ:GOLD` shows as `GOLD` with an `xyz` tag
// (Hyperliquid's HIP-3 dex); main markets show their symbol.
const props = defineProps<{ symbol: string; venueSymbol?: string | null }>()
const parts = computed(() => marketSymbolParts(props.symbol, props.venueSymbol))
</script>

<template>
  <span class="market-symbol" :title="parts.venue">
    <span v-if="parts.dex" class="market-dex-tag" :aria-label="`${parts.dex} dex`">{{
      parts.dex
    }}</span>
    <span>{{ parts.coin }}</span>
  </span>
</template>

<style scoped>
.market-symbol {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.market-dex-tag {
  padding: 0 0.28rem;
  color: var(--accent-color);
  font-size: 0.72em;
  font-weight: 500;
  line-height: 1.35;
  border: 1px solid color-mix(in srgb, var(--accent-color) 45%, transparent);
}
</style>
