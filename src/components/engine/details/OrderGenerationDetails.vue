<script setup lang="ts">
import { computed } from 'vue'

import DetailGrid from './DetailGrid.vue'
import EvidenceDisclosure from './EvidenceDisclosure.vue'
import type { OrderProjection } from '@/lib/gateway'
import { formatExactDecimal } from '@/lib/exactDecimalMath'

const props = defineProps<{
  order: OrderProjection
  generation: number
}>()

const row = computed(() => props.order.generations[String(props.generation)])
</script>

<template>
  <template v-if="row">
    <DetailGrid
      title="Order Generation"
      :rows="[
        { label: 'Generation', value: String(row.generation) },
        { label: 'Lifecycle', value: row.lifecycle.replace(/_/g, ' ') },
        { label: 'Quantity', value: formatExactDecimal(row.working_request.quantity) },
        { label: 'Filled quantity', value: formatExactDecimal(row.filled_quantity) },
        { label: 'Client order ID', value: row.client_order_id },
        { label: 'Remote order ID', value: row.active_remote_order_id ?? '-' },
        { label: 'Predecessor', value: row.predecessor_generation?.toString() ?? '-' },
        { label: 'Successor', value: row.successor_generation?.toString() ?? '-' },
      ]"
    />
    <EvidenceDisclosure title="Operations and Remote Identities">
      <DetailGrid
        :rows="[
          { label: 'Submit operation', value: row.submission_operation_id },
          { label: 'Modify operations', value: String(row.modify_operation_ids.length) },
          { label: 'Cancel operation', value: row.cancel_operation_id ?? '-' },
          { label: 'Reconciliation operation', value: row.reconciliation_operation_id ?? '-' },
          { label: 'Remote identities', value: String(row.remote_order_ids.length) },
        ]"
      />
    </EvidenceDisclosure>
  </template>
</template>
