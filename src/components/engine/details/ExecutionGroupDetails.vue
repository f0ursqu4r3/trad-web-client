<script setup lang="ts">
import { computed } from 'vue'

import type { ExecutionGroupProjection } from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import { detail } from './model'

const props = defineProps<{ group: ExecutionGroupProjection }>()

const summaryRows = computed(() => [
  detail('Purpose', props.group.purpose),
  detail('Lifecycle', props.group.lifecycle),
  detail('Accepted Quantity', props.group.accepted_quantity),
  detail('Target Quantity', props.group.target_quantity),
  detail('Filled Quantity', props.group.filled_quantity),
  detail('Child Orders', props.group.child_order_ids.length),
])
const outcomeRows = computed(() => [
  detail('Working', props.group.working_children),
  detail('Filled', props.group.filled_children),
  detail('Canceled', props.group.canceled_children),
  detail('Rejected', props.group.rejected_children),
  detail('Reconciliation', props.group.reconciliation_children),
])
</script>

<template>
  <div data-testid="execution-group-details">
    <DetailGrid title="Execution Group" :rows="summaryRows" />
    <DetailGrid title="Child Outcomes" :rows="outcomeRows" />
  </div>
</template>
