<script setup lang="ts">
import { formatExactDecimal, isExactZero } from '@/lib/exactDecimalMath'
import type { WorkspacePositionView } from '@/lib/projection/tradeWorkspace'

defineProps<{ rows: WorkspacePositionView[]; expanded?: boolean }>()
const emit = defineEmits<{ (event: 'select-trade', tradeId: string): void }>()

function quantity(long: string, short: string): string {
  if (!isExactZero(long) && !isExactZero(short)) {
    return `L ${formatExactDecimal(long)} · S ${formatExactDecimal(short)}`
  }
  if (!isExactZero(short)) return `-${formatExactDecimal(short)}`
  return formatExactDecimal(long)
}
</script>

<template>
  <section class="trader-panel summary-panel">
    <header class="trader-panel-header compact">
      <div>
        <span class="eyebrow">Exchange</span>
        <h2>Net positions</h2>
      </div>
      <span class="summary-count">{{ rows.length }}</span>
    </header>
    <div v-if="rows.length" class="summary-table" :class="{ expanded }">
      <div class="summary-head">
        <span>Coin</span><span>Venue net</span><span>Trad</span><span>External</span>
      </div>
      <div v-for="row in rows" :key="row.position.symbol" class="summary-row">
        <strong>{{ row.position.symbol }}</strong>
        <span>{{
          quantity(row.position.exchange_quantity.long, row.position.exchange_quantity.short)
        }}</span>
        <span class="managed">{{
          quantity(row.position.owned_quantity.long, row.position.owned_quantity.short)
        }}</span>
        <span
          :class="{
            external:
              !isExactZero(row.position.external_quantity.long) ||
              !isExactZero(row.position.external_quantity.short),
          }"
        >
          {{ quantity(row.position.external_quantity.long, row.position.external_quantity.short) }}
        </span>
        <div v-if="row.tradeIds.length" class="trade-links">
          <button
            v-for="tradeId in row.tradeIds"
            :key="tradeId"
            type="button"
            @click="emit('select-trade', tradeId)"
          >
            open trade #{{ tradeId.slice(-8) }}
          </button>
        </div>
      </div>
    </div>
    <div v-else class="small-empty">No exchange positions.</div>
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
  grid-template-columns: minmax(52px, 0.6fr) repeat(3, minmax(76px, 1fr));
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
.managed {
  color: var(--state-success);
}
.external {
  color: var(--state-warning);
}
.trade-links {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
}
.trade-links button {
  color: var(--accent-color);
  font-size: 11px;
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
</style>
