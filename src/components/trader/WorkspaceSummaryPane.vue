<script setup lang="ts">
import { ListChecks, WalletCards } from 'lucide-vue-next'

import type { WorkspaceOrderView, WorkspacePositionView } from '@/lib/projection/tradeWorkspace'
import OpenOrdersSummary from './OpenOrdersSummary.vue'
import PositionSummary from './PositionSummary.vue'

// The workspace's net positions or open orders section, full width.

defineProps<{
  section: 'positions' | 'orders'
  positions: WorkspacePositionView[]
  orders: WorkspaceOrderView[]
}>()
const emit = defineEmits<{ (event: 'select-trade', tradeId: string): void }>()
</script>

<template>
  <div v-if="section === 'positions'" class="primary-summary">
    <PositionSummary :rows="positions" expanded @select-trade="emit('select-trade', $event)" />
    <div class="summary-explanation">
      <WalletCards :size="16" />
      <p>
        Venue net is authoritative exchange exposure. Trad shows every durable managed scope
        separately and leaves manual or outside activity explicit.
      </p>
    </div>
  </div>
  <div v-else class="primary-summary">
    <OpenOrdersSummary :rows="orders" expanded @select-trade="emit('select-trade', $event)" />
    <div class="summary-explanation">
      <ListChecks :size="16" />
      <p>
        Managed orders link back to their owning trade. External orders stay unowned unless an
        explicit future adoption workflow proves that relationship.
      </p>
    </div>
  </div>
</template>

<style scoped>
.primary-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}
.summary-explanation {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.85rem;
  color: var(--fg-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
}
.summary-explanation p {
  margin: 0;
  max-width: 60rem;
  line-height: 1.55;
}
@media (max-width: 980px) {
  .primary-summary {
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
  }
}
</style>
