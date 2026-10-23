<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity } from 'lucide-vue-next'

import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import type { EngineCommandPrefill } from '@/lib/engineCommands/prefill'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import type { ManagedTradeView, TradeWorkspaceProjection } from '@/lib/projection/tradeWorkspace'
import ClosedTradeHistory from './ClosedTradeHistory.vue'
import ManagedTradeCard from './ManagedTradeCard.vue'

// The workspace's trade cards from the live projection, then (for the
// closed and all filters) older closed trades paged from the server.

const props = defineProps<{
  trades: ManagedTradeView[]
  // The live model: every trade with a card, shown or filtered out.
  model: TradeWorkspaceProjection | null
  snapshot: BrowserAccountSnapshot
  filter: 'active' | 'closed' | 'all'
  query: string
  expandedTradeId: string | null
  selectedTradeId: string | null
  focusedTradeId: string | null
  stale: boolean
}>()
const emit = defineEmits<{
  (event: 'toggle', tradeId: string): void
  (event: 'select', tradeId: string): void
  (event: 'duplicate', prefill: EngineCommandPrefill): void
}>()

const olderShown = ref(0)
// Older closed trades paged from the server skip these.
const cardScopeIds = computed(
  () =>
    new Set(
      [...(props.model?.activeTrades ?? []), ...(props.model?.closedTrades ?? [])].map(
        (trade) => trade.scopeId,
      ),
    ),
)
const pagesClosed = computed(() => props.filter !== 'active')
const empty = computed(
  () => props.trades.length === 0 && (!pagesClosed.value || olderShown.value === 0),
)
</script>

<template>
  <div class="trade-list">
    <ManagedTradeCard
      v-for="trade in trades"
      :key="trade.tradeId"
      :trade="trade"
      :snapshot="snapshot"
      :expanded="expandedTradeId === trade.tradeId"
      :selected="selectedTradeId === trade.tradeId"
      :focused="focusedTradeId === trade.tradeId"
      :stale="stale"
      @toggle="emit('toggle', $event)"
      @select="emit('select', $event)"
      @duplicate="emit('duplicate', $event)"
    />
    <PanelEmptyState
      v-if="empty"
      :title="
        filter === 'closed'
          ? 'No closed trades'
          : filter === 'all'
            ? 'No trades yet'
            : 'No active trades'
      "
      :description="
        filter === 'closed'
          ? 'Closed managed trades will remain available here as durable history.'
          : filter === 'all'
            ? 'Use the order ticket or command palette to establish your first managed trade.'
            : 'No managed trades currently need attention or execution.'
      "
    >
      <template #icon><Activity :size="18" /></template>
    </PanelEmptyState>
    <ClosedTradeHistory
      v-if="pagesClosed"
      :card-scope-ids="cardScopeIds"
      :query="query"
      :empty-label="trades.length === 0 ? '' : 'No older closed trades.'"
      @shown="olderShown = $event"
    />
  </div>
</template>

<style scoped>
.trade-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}
@media (max-width: 980px) {
  .trade-list {
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
  }
}
@media (max-width: 620px) {
  .trade-list {
    gap: 0.4rem;
    padding: 0.4rem;
  }
}
</style>
