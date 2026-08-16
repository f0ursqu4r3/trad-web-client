<script setup lang="ts">
import { computed } from 'vue'

import type { OrderProjection } from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import EvidenceDisclosure from './EvidenceDisclosure.vue'
import { compactDetails, detail, recordDetail, yesNo } from './model'

const props = defineProps<{
  order: OrderProjection
}>()

const executionKind = computed(() =>
  String(props.order.current_request.execution.kind ?? 'unknown'),
)
const summaryRows = computed(() =>
  compactDetails([
    detail('Symbol', props.order.current_request.symbol),
    detail('Side', props.order.current_request.side),
    detail('Position Side', props.order.current_request.position_side),
    detail('Execution', executionKind.value),
    recordDetail('Limit Price', props.order.current_request.execution, 'price'),
    recordDetail('Time In Force', props.order.current_request.execution, 'time_in_force'),
    detail('Reduce Only', yesNo(props.order.current_request.reduce_only)),
    detail('Lifecycle', props.order.lifecycle),
  ]),
)
const quantityRows = computed(() => [
  detail('Target Quantity', props.order.target_quantity),
  detail('Filled Quantity', props.order.filled_quantity),
  detail('Remaining Quantity', props.order.remaining_quantity),
  detail('Overfill Quantity', props.order.overfill_quantity),
  detail('Active Generation', props.order.active_generation),
  detail('Reconciliation Required', yesNo(props.order.reconciliation_required)),
])
const generations = computed(() =>
  Object.values(props.order.generations).sort((left, right) => left.generation - right.generation),
)
</script>

<template>
  <div data-testid="order-details">
    <DetailGrid title="Order" :rows="summaryRows" />
    <DetailGrid title="Fill State" :rows="quantityRows" />

    <div v-if="order.failure_reason" class="failure-block">
      <span>Order Failure</span>
      {{ order.failure_reason }}
    </div>

    <div v-if="order.blocking_reason" class="blocking-block">
      <span>Order Blocked</span>
      {{ order.blocking_reason }}
    </div>

    <EvidenceDisclosure :title="`Order Generations (${generations.length})`">
      <div class="generation-list">
        <article v-for="generation in generations" :key="generation.generation">
          <div>
            <span>Generation {{ generation.generation }}</span>
            <span>{{ generation.lifecycle }}</span>
          </div>
          <div>
            <span>{{ generation.filled_quantity }} filled</span>
            <span>{{ generation.working_request.quantity }} requested</span>
          </div>
          <div class="identifier">{{ generation.client_order_id }}</div>
        </article>
      </div>
    </EvidenceDisclosure>
  </div>
</template>

<style scoped>
.failure-block {
  display: grid;
  gap: 4px;
  padding: 9px 12px;
  color: var(--color-error);
  border-bottom: 1px solid var(--border-color);
}

.failure-block span {
  font-size: 10px;
  text-transform: uppercase;
}

.blocking-block {
  display: grid;
  gap: 4px;
  padding: 9px 12px;
  color: var(--color-warning);
  border-bottom: 1px solid var(--border-color);
}

.blocking-block span {
  font-size: 10px;
  text-transform: uppercase;
}

.generation-list {
  max-height: 240px;
  overflow: auto;
}

.generation-list article {
  display: grid;
  gap: 3px;
  padding: 7px 0;
  color: var(--color-text-dim);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  font-size: 10px;
}

.generation-list article > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.identifier {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
