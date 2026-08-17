<script setup lang="ts">
import { computed } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import type { ExternalOrderProjection } from '@/lib/gateway'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const summary = computed(() => projections.selectedLive?.checkpoint.summary ?? null)
const orders = computed(() =>
  [...(projections.selectedLive?.external_orders ?? [])].sort((left, right) =>
    orderKey(left).localeCompare(orderKey(right)),
  ),
)
const title = computed(() => {
  const account = accounts.selectedAccount
  return account === null ? 'External Orders' : `External Orders - ${account.label}`
})

function orderKey(order: ExternalOrderProjection): string {
  return `${order.terms?.symbol ?? ''}:${order.identity.kind}:${order.identity.value}`
}

function classification(order: ExternalOrderProjection): string {
  switch (order.classification) {
    case 'system_external':
      return 'external'
    case 'manual_external':
      return 'external · confirmed'
    case 'legacy_bound':
      return 'legacy bound'
    case 'unresolved':
      return 'unresolved'
  }
}
</script>

<template>
  <BaseCommandModal :title="title" :open="open" size="wide" @close="emit('close')">
    <div class="external-order-inspector" data-testid="external-order-inspector">
      <header class="inspector-intro">
        <p>
          These orders sit outside current native Order lineage. Legacy-bound rows retain an
          imported claim; Trad does not adopt, modify, or cancel the others by shape.
        </p>
        <div v-if="summary" class="inventory-counts">
          <span>{{ summary.system_external_orders }} tracked external</span>
          <span :class="{ danger: summary.unresolved_external_orders > 0 }">
            {{ summary.unresolved_external_orders }} unresolved
          </span>
          <span :class="{ danger: summary.unscoped_external_orders > 0 }">
            {{ summary.unscoped_external_orders }} unknown scope
          </span>
        </div>
      </header>

      <p v-if="orders.length === 0" class="empty-state">No external open orders.</p>

      <article
        v-for="order in orders"
        :key="`${order.identity.kind}:${order.identity.value}`"
        class="order-band"
        :data-classification="order.classification"
        :data-symbol="order.terms?.symbol"
      >
        <header>
          <div>
            <strong>{{ order.terms?.symbol ?? 'Unknown symbol' }}</strong>
            <span class="classification">{{ classification(order) }}</span>
            <span>{{ order.observation.status }}</span>
          </div>
          <span class="identity" :title="order.identity.value">
            {{ order.identity.kind }} {{ order.identity.value }}
          </span>
        </header>

        <div v-if="order.terms" class="terms-grid">
          <span>Side</span><strong>{{ order.terms.order_side }}</strong> <span>Position side</span
          ><strong>{{ order.terms.position_side ?? '-' }}</strong> <span>Remaining</span
          ><strong>{{ order.terms.remaining_quantity }}</strong> <span>Reduce only</span
          ><strong>{{ order.terms.reduce_only ? 'yes' : 'no' }}</strong> <span>Conditional</span
          ><strong>{{ order.terms.conditional ? 'yes' : 'no' }}</strong> <span>Working price</span
          ><strong>{{ order.observation.working_price ?? '-' }}</strong>
        </div>
        <p v-else class="danger">Authoritative economic scope is unavailable.</p>

        <footer>
          <span :title="order.observation.event_id">Evidence {{ order.observation.event_id }}</span>
          <span v-if="order.observation.client_order_id" :title="order.observation.client_order_id">
            Client {{ order.observation.client_order_id }}
          </span>
          <span v-if="order.observation.remote_order_id" :title="order.observation.remote_order_id">
            Remote {{ order.observation.remote_order_id }}
          </span>
        </footer>
      </article>
    </div>
  </BaseCommandModal>
</template>

<style scoped>
.external-order-inspector {
  display: grid;
  gap: 12px;
}

.inspector-intro,
.order-band > header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.inspector-intro p {
  max-width: 560px;
  margin: 0;
}

.inventory-counts,
.order-band > header > div,
.order-band footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.order-band {
  display: grid;
  gap: 10px;
  padding: 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-panel);
}

.classification {
  color: var(--color-info);
  text-transform: uppercase;
}

.identity,
.order-band footer {
  overflow: hidden;
  color: var(--color-text-dim);
  font-size: 11px;
  text-overflow: ellipsis;
}

.terms-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px 12px;
}

.terms-grid span {
  color: var(--color-text-dim);
}

.danger {
  color: var(--color-error);
}

@media (max-width: 760px) {
  .inspector-intro,
  .order-band > header {
    flex-direction: column;
  }

  .terms-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>
