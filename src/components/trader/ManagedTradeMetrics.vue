<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'

import { compareExact, formatExactDecimal } from '@/lib/exactDecimalMath'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'

const props = defineProps<{ trade: ManagedTradeView }>()

const stop = computed(() =>
  props.trade.protection?.plan.children.find((child) => child.protection_kind === 'stop_loss'),
)
const takeProfits = computed(
  () =>
    props.trade.protection?.plan.children.filter(
      (child) => child.protection_kind === 'take_profit',
    ) ?? [],
)

function totals(values: Map<string, string>): string {
  if (values.size === 0) return '-'
  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([asset, value]) => `${formatExactDecimal(value)} ${asset}`)
    .join(', ')
}

function totalTone(values: Map<string, string>): '' | 'positive' | 'negative' {
  if (values.size !== 1) return ''
  const value = values.values().next().value
  if (value === undefined) return ''
  const compared = compareExact(value, '0')
  return compared > 0 ? 'positive' : compared < 0 ? 'negative' : ''
}
</script>

<template>
  <div class="trade-metrics">
    <div>
      <span>Entry avg</span>
      <strong>{{
        trade.averageEntryPrice ? formatExactDecimal(trade.averageEntryPrice) : '-'
      }}</strong>
    </div>
    <div>
      <span>Filled / requested</span>
      <strong>
        {{ formatExactDecimal(trade.filledQuantity) }} /
        {{ trade.requestedQuantity ? formatExactDecimal(trade.requestedQuantity) : '-' }}
      </strong>
    </div>
    <div>
      <span>Managed remainder</span>
      <strong>{{ formatExactDecimal(trade.remainingQuantity) }}</strong>
    </div>
    <div>
      <span>Realized net</span>
      <strong :class="totalTone(trade.netAfterFees)">{{ totals(trade.netAfterFees) }}</strong>
    </div>
    <div>
      <span>Unrealized</span>
      <strong title="A durable mark-price aggregate is not published yet">-</strong>
    </div>
    <div>
      <span>Fees · builder</span>
      <strong>{{ totals(trade.totalFees) }} · {{ totals(trade.builderFees) }}</strong>
    </div>
  </div>

  <div class="protection-strip" :class="{ unprotected: !trade.protection }">
    <ShieldCheck :size="13" />
    <template v-if="trade.protection">
      <span>
        SL {{ stop ? formatExactDecimal(stop.trigger_price) : 'none' }} ·
        {{ takeProfits.length }} TP{{ takeProfits.length === 1 ? '' : 's' }} ·
        {{ formatExactDecimal(trade.protection.covered_quantity) }} /
        {{ formatExactDecimal(trade.protection.target_quantity) }} covered
      </span>
      <span class="protection-state">{{ trade.protection.status }}</span>
    </template>
    <span v-else>No attached protection is currently projected</span>
  </div>
</template>

<style scoped>
.trade-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(105px, 1fr));
  gap: 1px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.trade-metrics > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.65rem 0.7rem;
  background: var(--surface-sunken);
}
.trade-metrics span {
  color: var(--fg-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.trade-metrics strong {
  overflow: hidden;
  color: var(--fg-strong);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.positive {
  color: var(--state-success) !important;
}
.negative {
  color: var(--state-error) !important;
}
.protection-strip {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--border-subtle);
}
.protection-strip svg {
  color: var(--state-success);
}
.protection-strip.unprotected,
.protection-strip.unprotected svg {
  color: var(--state-warning);
}
.protection-state {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
}
@media (max-width: 1180px) {
  .trade-metrics {
    grid-template-columns: repeat(3, minmax(105px, 1fr));
  }
}
@media (max-width: 760px) {
  .trade-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
