<script setup lang="ts">
import { computed } from 'vue'

import type {
  NativeProtectionProjection,
  ProtectionAmendmentProjection,
  ProtectionProjection,
} from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import { detail } from './model'

const props = defineProps<{
  nativeProtection: NativeProtectionProjection | null
  exchangeProtections: ProtectionProjection[]
  amendment: ProtectionAmendmentProjection | null
}>()

const summaryRows = computed(() => {
  const protection = props.nativeProtection
  if (protection === null) return []
  return [
    detail('Status', protection.status),
    detail('Plan Revision', protection.plan_revision),
    detail('Covered Quantity', protection.covered_quantity),
    detail('Target Quantity', protection.target_quantity),
    detail('Position Side', protection.position_side),
    detail('Scope Revision', protection.scope_revision),
  ]
})

function childState(childId: string) {
  return props.nativeProtection?.children[childId] ?? null
}
</script>

<template>
  <section
    v-if="nativeProtection || exchangeProtections.length"
    class="protection-evidence"
    data-testid="protection-evidence"
  >
    <DetailGrid v-if="nativeProtection" title="Logical Native Protection" :rows="summaryRows" />

    <div v-if="nativeProtection" class="protection-list">
      <article v-for="child in nativeProtection.plan.children" :key="child.child_id">
        <div class="protection-heading">
          <span>{{ child.protection_kind }} @ {{ child.trigger_price }}</span>
          <span>{{ child.trigger_source }}</span>
        </div>
        <div class="protection-meta">
          <span>{{ child.execution.kind }}</span>
          <span>{{ child.allocation.kind }}</span>
          <span v-if="childState(child.child_id)">
            {{ childState(child.child_id)?.confirmed_quantity }} confirmed ·
            {{ childState(child.child_id)?.cumulative_filled_quantity }} filled
          </span>
        </div>
        <div v-if="childState(child.child_id)?.failure_reason" class="danger">
          {{ childState(child.child_id)?.failure_reason }}
        </div>
      </article>
      <div v-if="amendment" class="amendment">
        Edit {{ amendment.lifecycle }} · {{ amendment.completed_steps }} /
        {{ amendment.steps.length }} steps<span v-if="amendment.last_reason">
          · {{ amendment.last_reason }}</span
        >
      </div>
      <div v-if="nativeProtection.failure_reason" class="danger">
        {{ nativeProtection.failure_reason }}
      </div>
    </div>

    <details v-if="exchangeProtections.length" class="exchange-orders">
      <summary>Exchange protection orders ({{ exchangeProtections.length }})</summary>
      <article
        v-for="protection in exchangeProtections"
        :key="protection.remote_order_id"
        class="exchange-row"
      >
        <div class="protection-heading">
          <span>{{ protection.protection_kind }} @ {{ protection.trigger_price }}</span>
          <span>{{ protection.status }}</span>
        </div>
        <div class="protection-meta">
          <span>
            {{ protection.cumulative_filled_quantity }} / {{ protection.original_quantity }}
          </span>
          <span>{{ protection.present_on_exchange ? 'present' : 'not present' }}</span>
          <span>{{ protection.reduce_only ? 'reduce only' : 'not reduce only' }}</span>
        </div>
        <div v-if="protection.failure_reason" class="danger">
          {{ protection.failure_reason }}
        </div>
      </article>
    </details>
  </section>
</template>

<style scoped>
.protection-list,
.exchange-orders {
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border-color);
}

.protection-list article,
.exchange-row {
  display: grid;
  gap: 4px;
  padding: 7px 0;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
}

.protection-heading,
.protection-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 14px;
}

.protection-heading {
  color: var(--color-text);
}

.protection-meta {
  color: var(--color-text-dim);
  font-size: 10px;
}

.exchange-orders summary {
  cursor: pointer;
  color: var(--color-text);
}

.amendment {
  padding-top: 7px;
  color: var(--color-warning);
}

.danger {
  padding-top: 4px;
  color: var(--color-error);
}
</style>
