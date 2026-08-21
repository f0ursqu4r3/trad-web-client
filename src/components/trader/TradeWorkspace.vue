<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Activity, ListChecks, WalletCards } from 'lucide-vue-next'

import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import ReconciliationControl from '@/components/engine/ReconciliationControl.vue'
import { tradeWorkspaceProjection } from '@/lib/projection/tradeWorkspace'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import ManagedTradeCard from './ManagedTradeCard.vue'
import OpenOrdersSummary from './OpenOrdersSummary.vue'
import PositionSummary from './PositionSummary.vue'
import TradeTicket from './TradeTicket.vue'

export type TraderWorkspaceSection = 'trades' | 'positions' | 'orders'

defineProps<{ section: TraderWorkspaceSection }>()
const emit = defineEmits<{ (event: 'section', section: TraderWorkspaceSection): void }>()
const projections = useAccountProjectionStore()
const expandedTradeId = ref<string | null>(null)
const showClosed = ref(false)

const snapshot = computed(() => projections.selectedLive)
const model = computed(() =>
  snapshot.value === null ? null : tradeWorkspaceProjection(snapshot.value),
)
const visibleTrades = computed(() =>
  showClosed.value ? (model.value?.closedTrades ?? []) : (model.value?.activeTrades ?? []),
)

function toggleTrade(tradeId: string): void {
  expandedTradeId.value = expandedTradeId.value === tradeId ? null : tradeId
}

async function selectTrade(tradeId: string): Promise<void> {
  emit('section', 'trades')
  expandedTradeId.value = tradeId
  await nextTick()
  document.querySelector(`[data-trade-id="${CSS.escape(tradeId)}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  })
}
</script>

<template>
  <div class="trader-workspace" data-testid="trader-workspace">
    <aside class="workspace-sidebar">
      <div class="workspace-ticket">
        <TradeTicket />
      </div>
      <div class="workspace-summaries">
        <PositionSummary :rows="model?.positions ?? []" @select-trade="selectTrade" />
        <OpenOrdersSummary :rows="model?.openOrders ?? []" @select-trade="selectTrade" />
      </div>
    </aside>

    <main class="workspace-main">
      <header class="workspace-heading">
        <div>
          <span class="eyebrow">Trad-managed</span>
          <h1 v-if="section === 'trades'">Trades</h1>
          <h1 v-else-if="section === 'positions'">Net positions</h1>
          <h1 v-else>Open orders</h1>
        </div>
        <div class="workspace-status">
          <template v-if="section === 'trades'">
            <button
              class="btn btn-sm"
              type="button"
              :aria-pressed="!showClosed"
              @click="showClosed = false"
            >
              Active {{ model?.activeTrades.length ?? 0 }}
            </button>
            <button
              class="btn btn-sm"
              type="button"
              :aria-pressed="showClosed"
              @click="showClosed = true"
            >
              Closed {{ model?.closedTrades.length ?? 0 }}
            </button>
          </template>
          <ReconciliationControl />
        </div>
      </header>

      <div v-if="projections.selected?.status !== 'ready'" class="workspace-state">
        <PanelEmptyState
          :title="
            projections.selected?.status === 'error' ? 'Account unavailable' : 'Loading account'
          "
          :description="
            projections.selected?.error ?? 'Waiting for the authoritative account projection.'
          "
        >
          <template #icon><Activity :size="18" /></template>
        </PanelEmptyState>
      </div>

      <div v-else-if="section === 'trades'" class="trade-list">
        <ManagedTradeCard
          v-for="trade in visibleTrades"
          :key="trade.tradeId"
          :trade="trade"
          :snapshot="snapshot!"
          :expanded="expandedTradeId === trade.tradeId"
          @toggle="toggleTrade"
        />
        <PanelEmptyState
          v-if="visibleTrades.length === 0"
          :title="showClosed ? 'No closed trades' : 'No trades yet'"
          :description="
            showClosed
              ? 'Closed managed trades will remain available here as durable history.'
              : 'Use the order ticket or command palette to establish your first managed trade.'
          "
        >
          <template #icon><Activity :size="18" /></template>
        </PanelEmptyState>
      </div>

      <div v-else-if="section === 'positions'" class="primary-summary">
        <PositionSummary :rows="model?.positions ?? []" expanded @select-trade="selectTrade" />
        <div class="summary-explanation">
          <WalletCards :size="16" />
          <p>
            Venue net is authoritative exchange exposure. Trad shows every durable managed scope
            separately and leaves manual or outside activity explicit.
          </p>
        </div>
      </div>

      <div v-else class="primary-summary">
        <OpenOrdersSummary :rows="model?.openOrders ?? []" expanded @select-trade="selectTrade" />
        <div class="summary-explanation">
          <ListChecks :size="16" />
          <p>
            Managed orders link back to their owning trade. External orders stay unowned unless an
            explicit future adoption workflow proves that relationship.
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.trader-workspace {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-areas: 'sidebar main';
  grid-template-columns: minmax(310px, 380px) minmax(0, 1fr);
  overflow: hidden;
  background: var(--surface-canvas);
}
.workspace-sidebar {
  grid-area: sidebar;
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--border-normal);
  background: var(--surface-sunken);
}
.workspace-ticket,
.workspace-summaries,
.workspace-main {
  min-height: 0;
}
.workspace-ticket {
  padding: 0.75rem 0.75rem 0;
}
.workspace-summaries {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}
.workspace-main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: auto;
}
.workspace-heading {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1rem;
  background: color-mix(in srgb, var(--surface-muted) 88%, var(--surface-base));
  border-bottom: 1px solid var(--border-normal);
}
.workspace-heading h1 {
  margin: 0.12rem 0 0;
  color: var(--fg-strong);
  font-size: 17px;
  font-weight: 500;
}
.workspace-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.trade-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}
.workspace-state {
  flex: 1;
  min-height: 300px;
}
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
  .trader-workspace {
    display: flex;
    height: auto;
    min-height: 100%;
    flex-direction: column;
    overflow: visible;
  }
  .workspace-sidebar {
    display: contents;
  }
  .workspace-ticket {
    order: 1;
  }
  .workspace-main {
    order: 2;
    overflow: visible;
  }
  .workspace-summaries {
    order: 3;
  }
  .workspace-ticket {
    min-width: 0;
    max-width: 100%;
    padding: 0.75rem;
    overflow-x: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--border-normal);
  }
  .workspace-summaries {
    border-right: 0;
    border-top: 1px solid var(--border-normal);
  }
  .workspace-heading {
    position: static;
  }
  .trade-list,
  .primary-summary,
  .workspace-summaries {
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
  }
}
@media (max-width: 620px) {
  .workspace-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .workspace-status {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
