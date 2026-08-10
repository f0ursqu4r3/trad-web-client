<script setup lang="ts">
import { computed } from 'vue'

import type { ExecutionProjection } from '@/lib/gateway'
import {
  formatExactAssetTotals,
  summarizeProjectionExecutions,
} from '@/lib/projection/executionEconomics'
import DetailGrid from './DetailGrid.vue'
import { detail } from './model'

const props = defineProps<{
  executions: ExecutionProjection[]
}>()

const economics = computed(() => summarizeProjectionExecutions(props.executions))
const economicsRows = computed(() => [
  detail('Total Fees', formatExactAssetTotals(economics.value.totalFees)),
  detail('Builder Component', formatExactAssetTotals(economics.value.builderFees)),
  detail('Exchange Component', formatExactAssetTotals(economics.value.exchangeFees)),
  detail('Realized PnL', formatExactAssetTotals(economics.value.realizedPnl)),
  detail('Net After Fees', formatExactAssetTotals(economics.value.netAfterFees)),
  detail('Fill Count', props.executions.length),
])

function liquidity(execution: ExecutionProjection): string {
  if (execution.fill.is_maker === true) return 'maker'
  if (execution.fill.is_maker === false) return 'taker'
  return 'unknown'
}
</script>

<template>
  <section v-if="executions.length" class="execution-evidence" data-testid="execution-economics">
    <DetailGrid title="Execution Economics" :rows="economicsRows" />
    <details open>
      <summary>Fills ({{ executions.length }})</summary>
      <div class="fill-list">
        <article v-for="execution in executions" :key="execution.event_id" class="fill-row">
          <div class="fill-heading">
            <span>{{ execution.fill.quantity }} @ {{ execution.fill.price }}</span>
            <span>{{ liquidity(execution) }}</span>
          </div>
          <div class="fill-meta">
            <span>{{ new Date(execution.fill.occurred_at).toLocaleString() }}</span>
            <span v-if="execution.fill.fee">
              Fee {{ execution.fill.fee.amount }} {{ execution.fill.fee.asset }}
            </span>
            <span v-if="execution.fill.builder_fee">
              Builder {{ execution.fill.builder_fee.amount }}
              {{ execution.fill.builder_fee.asset }}
            </span>
            <span v-if="execution.fill.realized_pnl">
              PnL {{ execution.fill.realized_pnl.amount }}
              {{ execution.fill.realized_pnl.asset }}
            </span>
            <span v-if="execution.reconciliation_required" class="danger">
              reconciliation required
            </span>
          </div>
          <div class="fill-ids">
            <span :title="execution.fill.execution_id ?? undefined">
              execution {{ execution.fill.execution_id ?? '-' }}
            </span>
            <span :title="execution.fill.remote_order_id ?? undefined">
              remote order {{ execution.fill.remote_order_id ?? '-' }}
            </span>
            <span v-if="execution.fill.transaction_hash" :title="execution.fill.transaction_hash">
              transaction {{ execution.fill.transaction_hash }}
            </span>
          </div>
        </article>
      </div>
    </details>
  </section>
</template>

<style scoped>
.execution-evidence > details {
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border-color);
}

summary {
  cursor: pointer;
  color: var(--color-text);
}

.fill-list {
  max-height: 280px;
  margin-top: 7px;
  overflow: auto;
}

.fill-row {
  display: grid;
  gap: 4px;
  padding: 7px 0;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
}

.fill-heading,
.fill-meta,
.fill-ids {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 14px;
}

.fill-heading {
  color: var(--color-text);
}

.fill-meta,
.fill-ids {
  color: var(--color-text-dim);
  font-size: 10px;
}

.fill-ids span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.danger {
  color: var(--color-error);
}
</style>
