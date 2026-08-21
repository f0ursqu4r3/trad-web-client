<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { Activity, ListChecks, WalletCards } from 'lucide-vue-next'

import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import ReconciliationControl from '@/components/engine/ReconciliationControl.vue'
import ProjectionCommandFilters from '@/components/engine/ProjectionCommandFilters.vue'
import type { EngineCommandPrefill } from '@/lib/engineCommands/prefill'
import { tradeWorkspaceProjection } from '@/lib/projection/tradeWorkspace'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'
import ManagedTradeCard from './ManagedTradeCard.vue'
import OpenOrdersSummary from './OpenOrdersSummary.vue'
import PositionSummary from './PositionSummary.vue'
import TradeDiscovery from './TradeDiscovery.vue'
import TradeTicket from './TradeTicket.vue'

export type TraderWorkspaceSection = 'trades' | 'positions' | 'orders'

defineProps<{ section: TraderWorkspaceSection }>()
const emit = defineEmits<{ (event: 'section', section: TraderWorkspaceSection): void }>()
const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()
const expandedTradeId = ref<string | null>(null)
const selectedTradeId = ref<string | null>(null)
const focusedTradeId = ref<string | null>(null)
const mobilePane = ref<'ticket' | 'trades'>('trades')
const ticket = ref<InstanceType<typeof TradeTicket> | null>(null)
const sidebar = ref<HTMLElement | null>(null)
const showClosed = ref(false)
const query = ref('')
let focusTimer: number | null = null

const snapshot = computed(() => projections.selectedLive)
const model = computed(() =>
  snapshot.value === null ? null : tradeWorkspaceProjection(snapshot.value),
)
const sourceTrades = computed(() =>
  showClosed.value ? (model.value?.closedTrades ?? []) : (model.value?.activeTrades ?? []),
)
const visibleTrades = computed(() => {
  const commandIds = new Set(ui.filteredCommands.map((command) => command.command_id))
  const normalized = query.value.trim().toLowerCase()
  return sourceTrades.value
    .filter((trade) => {
      if (!commandIds.has(trade.primaryCommand.command_id)) return false
      if (normalized === '') return true
      const meta = ui.meta(trade.primaryCommand.command_id)
      return [
        meta.nickname,
        trade.symbol,
        trade.side,
        trade.entryLabel,
        trade.lifecycle,
        trade.tradeId,
        trade.primaryCommand.command_id,
      ].some((value) => value?.toLowerCase().includes(normalized))
    })
    .sort((left, right) => {
      const pinned =
        Number(ui.meta(right.primaryCommand.command_id).pinned) -
        Number(ui.meta(left.primaryCommand.command_id).pinned)
      return pinned || right.createdAt - left.createdAt
    })
})
const hiddenTradeCount = computed(() => sourceTrades.value.length - visibleTrades.value.length)

function toggleTrade(tradeId: string): void {
  expandedTradeId.value = expandedTradeId.value === tradeId ? null : tradeId
}

function markSelected(tradeId: string): void {
  selectedTradeId.value = tradeId
}

async function selectTrade(tradeId: string): Promise<void> {
  mobilePane.value = 'trades'
  emit('section', 'trades')
  query.value = ''
  ui.resetCommandFilters()
  showClosed.value = model.value?.closedTrades.some((trade) => trade.tradeId === tradeId) ?? false
  expandedTradeId.value = tradeId
  selectedTradeId.value = tradeId
  focusedTradeId.value = tradeId
  if (focusTimer !== null) window.clearTimeout(focusTimer)
  focusTimer = window.setTimeout(() => {
    if (focusedTradeId.value === tradeId) focusedTradeId.value = null
  }, 1_100)
  await nextTick()
  document.querySelector(`[data-trade-id="${CSS.escape(tradeId)}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
  })
}

async function duplicateTrade(prefill: EngineCommandPrefill): Promise<void> {
  await ticket.value?.applyPrefill(prefill)
  mobilePane.value = 'ticket'
  await nextTick()
  sidebar.value?.scrollTo({ top: 0, behavior: 'smooth' })
  sidebar.value?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}

onBeforeUnmount(() => {
  if (focusTimer !== null) window.clearTimeout(focusTimer)
})
</script>

<template>
  <div class="trader-workspace" :class="`mobile-pane-${mobilePane}`" data-testid="trader-workspace">
    <nav v-if="section === 'trades'" class="mobile-workspace-tabs" aria-label="Trade workspace">
      <button type="button" :aria-pressed="mobilePane === 'ticket'" @click="mobilePane = 'ticket'">
        New trade
      </button>
      <button type="button" :aria-pressed="mobilePane === 'trades'" @click="mobilePane = 'trades'">
        Trades
      </button>
    </nav>

    <aside ref="sidebar" class="workspace-sidebar">
      <div class="workspace-ticket">
        <TradeTicket ref="ticket" />
      </div>
      <div class="workspace-summaries">
        <PositionSummary :rows="model?.positions ?? []" @select-trade="selectTrade" />
        <OpenOrdersSummary :rows="model?.openOrders ?? []" @select-trade="selectTrade" />
      </div>
    </aside>

    <main class="workspace-main">
      <header class="workspace-heading">
        <div class="workspace-title">
          <h1 v-if="section === 'trades'">Trades</h1>
          <h1 v-else-if="section === 'positions'">Net positions</h1>
          <h1 v-else>Open orders</h1>
        </div>
        <TradeDiscovery
          v-if="section === 'trades'"
          v-model="query"
          :shown="visibleTrades.length"
          :hidden="hiddenTradeCount"
        />
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

      <ProjectionCommandFilters
        v-if="section === 'trades' && ui.showCommandFilters"
        class="workspace-filter-panel"
      />

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
          :selected="selectedTradeId === trade.tradeId"
          :focused="focusedTradeId === trade.tradeId"
          @toggle="toggleTrade"
          @select="markSelected"
          @duplicate="duplicateTrade"
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
.mobile-workspace-tabs {
  display: none;
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
  background-color: var(--surface-canvas);
  background-image:
    linear-gradient(color-mix(in srgb, var(--border-subtle) 34%, transparent) 1px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--border-subtle) 34%, transparent) 1px,
      transparent 1px
    );
  background-size: 32px 32px;
}
.workspace-heading {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.38rem 0.75rem;
  background: color-mix(in srgb, var(--surface-muted) 88%, var(--surface-base));
  border-bottom: 1px solid var(--border-normal);
}
.workspace-heading h1 {
  margin: 0;
  color: var(--fg-strong);
  font-size: 14px;
  font-weight: 500;
}
.workspace-title {
  min-width: 5.5rem;
}
.workspace-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.workspace-filter-panel {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border-normal);
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
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-areas:
      'tabs'
      'content';
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }
  .mobile-workspace-tabs {
    display: grid;
    grid-area: tabs;
    grid-template-columns: 1fr 1fr;
    min-height: 32px;
    background: var(--surface-muted);
    border-bottom: 1px solid var(--border-normal);
  }
  .mobile-workspace-tabs button {
    color: var(--fg-muted);
    background: transparent;
    border: 0;
    border-right: 1px solid var(--border-subtle);
  }
  .mobile-workspace-tabs button:last-child {
    border-right: 0;
  }
  .mobile-workspace-tabs button[aria-pressed='true'] {
    color: var(--accent-color);
    background: var(--surface-active);
    box-shadow: inset 0 -2px var(--accent-color);
  }
  .workspace-sidebar {
    display: block;
    grid-area: content;
    min-width: 0;
    overflow: auto;
    border-right: 0;
  }
  .workspace-main {
    grid-area: content;
    overflow: auto;
  }
  .mobile-pane-ticket .workspace-main {
    display: none;
  }
  .mobile-pane-trades .workspace-sidebar {
    display: none;
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
    min-height: 0;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
  }
  .workspace-status {
    width: auto;
    margin-left: auto;
    flex-wrap: wrap;
    gap: 0.28rem;
  }
  .workspace-title {
    min-width: auto;
  }
  .trade-list {
    gap: 0.4rem;
    padding: 0.4rem;
  }
}
</style>
