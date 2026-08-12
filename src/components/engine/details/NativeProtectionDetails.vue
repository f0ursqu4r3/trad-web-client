<script setup lang="ts">
import { computed } from 'vue'

import DetailGrid from './DetailGrid.vue'
import type { NativeProtectionProjection, ProtectionProjection } from '@/lib/gateway'
import { formatExactDecimal } from '@/lib/exactDecimalMath'

const props = defineProps<{
  protection: NativeProtectionProjection
  exchangeProtections: ProtectionProjection[]
}>()

const coverageTone = computed(() => {
  if (
    props.protection.status === 'reconciliation_required' ||
    props.protection.status === 'failed_unprotected'
  ) {
    return 'error'
  }
  if (props.protection.covered_quantity === props.protection.target_quantity) return 'success'
  return 'warning'
})
</script>

<template>
  <section class="native-protection-details">
    <div class="protection-heading">
      <div>
        <h3>Native Protection</h3>
        <p>{{ protection.symbol }} · {{ protection.position_side }}</p>
      </div>
      <span class="status-pill" :class="`tone-${coverageTone}`">{{ protection.status }}</span>
    </div>

    <section class="detail-section">
      <h4>Coverage</h4>
      <DetailGrid
        :rows="[
          { label: 'Target quantity', value: formatExactDecimal(protection.target_quantity) },
          { label: 'Covered quantity', value: formatExactDecimal(protection.covered_quantity) },
          { label: 'Scope revision', value: String(protection.scope_revision) },
          { label: 'Plan revision', value: String(protection.plan_revision) },
        ]"
      />
    </section>

    <section class="detail-section">
      <h4>Protection Plan</h4>
      <div class="protection-children">
        <article
          v-for="child in protection.plan.children"
          :key="child.child_id"
          class="protection-child"
        >
          <header>
            <span>{{ child.protection_kind.replace(/_/g, ' ') }}</span>
            <span>{{
              protection.children[child.child_id]?.failure_reason ? 'failed' : 'active'
            }}</span>
          </header>
          <DetailGrid
            :rows="[
              { label: 'Trigger price', value: formatExactDecimal(child.trigger_price) },
              { label: 'Trigger source', value: child.trigger_source.replace(/_/g, ' ') },
              { label: 'Execution', value: child.execution.kind.replace(/_/g, ' ') },
              { label: 'Allocation', value: child.allocation.kind.replace(/_/g, ' ') },
              {
                label: 'Target',
                value: formatExactDecimal(
                  protection.children[child.child_id]?.target_quantity ?? '0',
                ),
              },
              {
                label: 'Confirmed',
                value: formatExactDecimal(
                  protection.children[child.child_id]?.confirmed_quantity ?? '0',
                ),
              },
              {
                label: 'Filled',
                value: formatExactDecimal(
                  protection.children[child.child_id]?.cumulative_filled_quantity ?? '0',
                ),
              },
              {
                label: 'Remote orders',
                value: String(protection.children[child.child_id]?.remote_order_ids.length ?? 0),
              },
            ]"
          />
          <p v-if="protection.children[child.child_id]?.failure_reason" class="failure-reason">
            {{ protection.children[child.child_id]?.failure_reason }}
          </p>
        </article>
      </div>
    </section>

    <section v-if="exchangeProtections.length" class="detail-section">
      <h4>Exchange Evidence</h4>
      <article
        v-for="row in exchangeProtections"
        :key="row.remote_order_id"
        class="exchange-evidence"
      >
        <span>{{ row.protection_kind.replace(/_/g, ' ') }}</span>
        <span>{{ formatExactDecimal(row.trigger_price) }}</span>
        <span>{{ row.status }}</span>
        <span :title="row.remote_order_id">#{{ row.remote_order_id.slice(0, 12) }}</span>
      </article>
    </section>

    <p v-if="protection.failure_reason" class="failure-reason">{{ protection.failure_reason }}</p>
  </section>
</template>

<style scoped>
.native-protection-details {
  color: var(--color-text);
}

.protection-heading {
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  padding: 12px;
}

h3 {
  font-size: 14px;
  margin: 0;
}
.protection-heading p {
  color: var(--color-text-dim);
  font-size: 11px;
  margin: 5px 0 0;
}

.status-pill {
  border: 1px solid var(--border-color);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 3px 7px;
  text-transform: uppercase;
}

.tone-success {
  border-color: var(--color-success);
  color: var(--color-success);
}
.tone-warning {
  border-color: var(--color-warning);
  color: var(--color-warning);
}
.tone-error {
  border-color: var(--color-error);
  color: var(--color-error);
}

.detail-section {
  border-bottom: 1px solid var(--border-color);
}
.detail-section > h4 {
  color: var(--color-text-dim);
  font-size: 10px;
  margin: 0;
  padding: 8px 12px;
  text-transform: uppercase;
}

.protection-children {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}
.protection-child {
  border: 1px solid var(--border-color);
}
.protection-child > header {
  display: flex;
  font-size: 10px;
  justify-content: space-between;
  padding: 7px 9px;
  text-transform: uppercase;
}

.exchange-evidence {
  display: grid;
  font-family: var(--font-mono);
  font-size: 10px;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 5px 12px;
}

.failure-reason {
  border-left: 2px solid var(--color-error);
  color: var(--color-error);
  font-size: 11px;
  margin: 8px 12px;
  padding-left: 8px;
}
</style>
