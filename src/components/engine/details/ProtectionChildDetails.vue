<script setup lang="ts">
import { computed } from 'vue'

import DetailGrid from './DetailGrid.vue'
import type { NativeProtectionProjection } from '@/lib/gateway'
import { formatExactDecimal } from '@/lib/exactDecimalMath'

const props = defineProps<{
  protection: NativeProtectionProjection
  childId: string
}>()

const plan = computed(() =>
  props.protection.plan.children.find((child) => child.child_id === props.childId),
)
const state = computed(() => props.protection.children[props.childId])

async function copyRemoteId(remoteId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(remoteId)
  } catch {
    // Clipboard access may be unavailable outside a secure browser context.
  }
}
</script>

<template>
  <template v-if="plan">
    <DetailGrid
      title="Protection Order"
      :rows="[
        { label: 'Kind', value: plan.protection_kind.replace(/_/g, ' ') },
        { label: 'Trigger price', value: formatExactDecimal(plan.trigger_price) },
        { label: 'Trigger source', value: plan.trigger_source.replace(/_/g, ' ') },
        { label: 'Execution', value: plan.execution.kind.replace(/_/g, ' ') },
        { label: 'Allocation', value: plan.allocation.kind.replace(/_/g, ' ') },
        { label: 'Target quantity', value: formatExactDecimal(state?.target_quantity ?? '0') },
        {
          label: 'Confirmed quantity',
          value: formatExactDecimal(state?.confirmed_quantity ?? '0'),
        },
        {
          label: 'Filled quantity',
          value: formatExactDecimal(state?.cumulative_filled_quantity ?? '0'),
        },
      ]"
    />
    <details class="evidence">
      <summary>Exchange evidence ({{ state?.remote_order_ids.length ?? 0 }})</summary>
      <button
        v-for="remoteId in state?.remote_order_ids ?? []"
        :key="remoteId"
        type="button"
        :title="`Copy ${remoteId}`"
        @click="copyRemoteId(remoteId)"
      >
        {{ remoteId }}
      </button>
    </details>
    <p v-if="state?.failure_reason" class="failure-reason">{{ state.failure_reason }}</p>
  </template>
</template>

<style scoped>
.evidence {
  border-bottom: 1px solid var(--border-color);
  padding: 8px 12px;
}
.evidence summary {
  color: var(--color-text-dim);
  cursor: pointer;
  font-size: 11px;
}
.evidence button {
  background: transparent;
  border: 0;
  color: var(--color-info);
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  overflow: hidden;
  padding: 5px 0 0;
  text-align: left;
  text-overflow: ellipsis;
  width: 100%;
}
.failure-reason {
  border-left: 2px solid var(--color-error);
  color: var(--color-error);
  font-size: 11px;
  margin: 8px 12px;
  padding-left: 8px;
}
</style>
