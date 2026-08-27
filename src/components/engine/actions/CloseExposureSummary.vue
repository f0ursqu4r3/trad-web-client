<script setup lang="ts">
import { formatExactDecimal } from '@/lib/exactDecimalMath'

defineProps<{
  symbol: string
  side: string
  ownedQuantity: string
  selectedQuantity: string
  remainder: string
  notional: string | null
  referenceLabel: string
  baseUnit: string | null
  quoteUnit: string | null
}>()
</script>

<template>
  <section class="close-context" data-testid="close-exposure-context">
    <div>
      <span>Source Exposure</span>
      <strong>
        {{ symbol }} · {{ side }} · {{ formatExactDecimal(ownedQuantity) }} {{ baseUnit ?? '' }}
      </strong>
    </div>
    <div>
      <span>Selected Close</span>
      <strong>
        {{ selectedQuantity ? formatExactDecimal(selectedQuantity) : '-' }} {{ baseUnit ?? '' }}
      </strong>
    </div>
    <div>
      <span>Owned Remainder</span>
      <strong>
        {{ remainder === '-' ? '-' : formatExactDecimal(remainder) }} {{ baseUnit ?? '' }}
      </strong>
    </div>
    <div>
      <span
        >Estimated Notional<span v-if="referenceLabel"> · {{ referenceLabel }}</span></span
      >
      <strong>
        {{ notional === null ? '-' : formatExactDecimal(notional) }}
        {{ notional === null ? '' : (quoteUnit ?? '') }}
      </strong>
    </div>
  </section>
</template>

<style scoped>
.close-context {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-block: 1px solid var(--border-color);
}
.close-context > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
}
.close-context span {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}
.close-context strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 12px;
  font-weight: normal;
}
</style>
