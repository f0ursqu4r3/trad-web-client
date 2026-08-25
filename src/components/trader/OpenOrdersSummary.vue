<script setup lang="ts">
import { formatExactDecimal } from '@/lib/exactDecimalMath'
import type { WorkspaceOrderView } from '@/lib/projection/tradeWorkspace'

defineProps<{ rows: WorkspaceOrderView[]; expanded?: boolean }>()
const emit = defineEmits<{ (event: 'select-trade', tradeId: string): void }>()
</script>

<template>
  <section class="trader-panel summary-panel">
    <header class="trader-panel-header compact">
      <div>
        <span class="eyebrow">Exchange</span>
        <h2>Open orders</h2>
      </div>
      <span class="summary-count">{{ rows.length }}</span>
    </header>
    <div v-if="rows.length" class="summary-table" :class="{ expanded }">
      <div class="summary-head">
        <span>Coin</span><span>Purpose</span><span>Remaining</span><span>Price</span><span></span>
      </div>
      <div v-for="row in rows" :key="row.id" class="summary-row">
        <strong>{{ row.symbol }}</strong>
        <span :class="{ external: !row.managed }">{{ row.purpose }}</span>
        <span>{{ formatExactDecimal(row.remainingQuantity) }}</span>
        <span>{{ row.price ? formatExactDecimal(row.price) : '-' }}</span>
        <button
          v-if="row.tradeId"
          class="order-link"
          type="button"
          @click="emit('select-trade', row.tradeId)"
        >
          trade
        </button>
        <span v-else class="external-label">outside Trad</span>
      </div>
    </div>
    <div v-else class="small-empty">No working exchange orders.</div>
  </section>
</template>

<style scoped>
.summary-count {
  color: var(--fg-muted);
  font-size: 11px;
}
.summary-head,
.summary-row {
  display: grid;
  grid-template-columns: minmax(48px, 0.55fr) minmax(68px, 0.8fr) minmax(76px, 1fr) minmax(
      74px,
      1fr
    ) auto;
  gap: 0.5rem;
  align-items: center;
  min-height: 34px;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
}
.summary-head {
  min-height: 30px;
  color: var(--fg-muted);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: var(--surface-sunken);
}
.summary-row {
  font-size: 12px;
}
.summary-row strong {
  font-weight: 500;
}
.external,
.external-label {
  color: var(--state-warning);
}
.external-label {
  font-size: 10px;
  text-transform: uppercase;
}
.order-link {
  color: var(--accent-color);
  background: none;
  border: 0;
}
.small-empty {
  padding: 1rem;
  color: var(--fg-muted);
  text-align: center;
}
.summary-table:not(.expanded) .summary-row:nth-of-type(n + 7) {
  display: none;
}
@media (max-width: 460px) {
  .summary-head,
  .summary-row {
    grid-template-columns: 44px 1fr 1fr auto;
  }
  .summary-head span:nth-child(4),
  .summary-row span:nth-child(4) {
    display: none;
  }
}
</style>
