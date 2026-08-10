<script setup lang="ts">
import { computed } from 'vue'

import type { ProjectionEntity } from '@/lib/projection/presentation'
import DetailGrid from './DetailGrid.vue'
import {
  compactDetails,
  detail,
  formatProjectionValue,
  optionalDetail,
  recordDetail,
  yesNo,
} from './model'

type OperationalEntity = Extract<
  ProjectionEntity,
  {
    kind:
      | 'close_workflow'
      | 'flatten_workflow'
      | 'entry_cancellation'
      | 'account_control'
      | 'protection_amendment'
  }
>

const props = defineProps<{ entity: OperationalEntity }>()

const title = computed(() => {
  switch (props.entity.kind) {
    case 'close_workflow':
      return 'Close Workflow'
    case 'flatten_workflow':
      return 'Flatten Workflow'
    case 'entry_cancellation':
      return 'Entry Cancellation'
    case 'account_control':
      return 'Account Control'
    case 'protection_amendment':
      return 'Protection Amendment'
  }
  return 'Operation'
})

const rows = computed(() => {
  const entity = props.entity
  switch (entity.kind) {
    case 'close_workflow':
      return compactDetails([
        detail('Symbol', entity.row.symbol),
        detail('Position Side', entity.row.position_side),
        detail('Lifecycle', entity.row.lifecycle),
        detail('Close All', yesNo(entity.row.close_all)),
        detail('Requested Quantity', entity.row.requested_quantity),
        detail('Execution', entity.row.execution.kind),
        detail('Authoritative Side', yesNo(entity.row.authoritative_side)),
        detail('External Quantity', entity.row.requested_external_quantity),
        detail('Sources', entity.row.source_command_ids.length),
        optionalDetail('Last Reason', entity.row.last_reason),
      ])
    case 'flatten_workflow':
      return compactDetails([
        detail('Lifecycle', entity.row.lifecycle),
        detail('Target', formatProjectionValue(entity.row.target)),
        detail('Affected Commands', entity.row.affected_command_ids.length),
        detail('Close Workflows', entity.row.close_workflow_ids.length),
        optionalDetail('Last Reason', entity.row.last_reason),
      ])
    case 'entry_cancellation':
      return compactDetails([
        detail('Lifecycle', entity.row.lifecycle),
        detail('Target', formatProjectionValue(entity.row.target)),
        detail('Affected Commands', entity.row.affected_command_ids.length),
        detail('Entry Orders', entity.row.source_order_ids.length),
        optionalDetail('Last Reason', entity.row.last_reason),
      ])
    case 'account_control':
      return compactDetails([
        detail('Control', entity.row.request.kind),
        detail('Lifecycle', entity.row.lifecycle),
        recordDetail('Symbol', entity.row.request, 'symbol'),
        recordDetail('Leverage', entity.row.request, 'leverage'),
        recordDetail('Margin Mode', entity.row.request, 'margin_mode'),
        recordDetail('Position Mode', entity.row.request, 'mode'),
        optionalDetail('Last Reason', entity.row.last_reason),
      ])
    case 'protection_amendment':
      return compactDetails([
        detail('Lifecycle', entity.row.lifecycle),
        detail('Expected Plan Revision', entity.row.expected_plan_revision),
        detail('Completed Steps', `${entity.row.completed_steps} / ${entity.row.steps.length}`),
        optionalDetail('Active Operation', entity.row.active_operation_id),
        optionalDetail('Last Reason', entity.row.last_reason),
      ])
  }
  return []
})
</script>

<template>
  <div data-testid="operational-details">
    <DetailGrid :title="title" :rows="rows" />
    <details v-if="entity.kind === 'protection_amendment'" class="step-list">
      <summary>Amendment steps ({{ entity.row.steps.length }})</summary>
      <div v-for="(step, index) in entity.row.steps" :key="index" class="step-row">
        <span>{{ index + 1 }}. {{ step.kind }}</span>
        <span>{{ index < entity.row.completed_steps ? 'completed' : 'pending' }}</span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.step-list {
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border-color);
}

.step-list summary {
  cursor: pointer;
  color: var(--color-text);
}

.step-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  color: var(--color-text-dim);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
}
</style>
