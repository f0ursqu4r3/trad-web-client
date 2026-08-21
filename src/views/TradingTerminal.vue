<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { Activity, ListChecks, Network, WalletCards } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'

import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import EngineWorkspace from '@/components/engine/EngineWorkspace.vue'
import EngineCommandPalette from '@/components/engine/commands/EngineCommandPalette.vue'
import TerminalAccountEmptyState from '@/components/terminal/TerminalAccountEmptyState.vue'
import TradeWorkspace, {
  type TraderWorkspaceSection,
} from '@/components/trader/TradeWorkspace.vue'
import { useAccountsStore } from '@/stores/accounts'
import { openCommandPalette } from '@/lib/engineCommands/palette'

const accounts = useAccountsStore()
const route = useRoute()
const router = useRouter()
const surface = ref<'workspace' | 'diagnostics'>('workspace')
const section = ref<TraderWorkspaceSection>('trades')

function selectWorkspace(next: TraderWorkspaceSection): void {
  surface.value = 'workspace'
  section.value = next
}

onMounted(async () => {
  if (accounts.lastFetchedAt === null && !accounts.loading) await accounts.fetchAccounts()
  if (route.query.commands === 'open' && accounts.accounts.length > 0) {
    await nextTick()
    openCommandPalette()
    const query = { ...route.query }
    delete query.commands
    void router.replace({ query })
  }
})
</script>

<template>
  <TerminalAccountEmptyState
    v-if="accounts.lastFetchedAt !== null && accounts.accounts.length === 0"
  />
  <div v-else class="terminal-shell">
    <nav class="terminal-views" aria-label="Trading workspace views">
      <div class="view-tabs">
        <button
          type="button"
          :class="{ active: surface === 'workspace' && section === 'trades' }"
          @click="selectWorkspace('trades')"
        >
          <Activity :size="13" /> Trades
        </button>
        <button
          type="button"
          :class="{ active: surface === 'workspace' && section === 'positions' }"
          @click="selectWorkspace('positions')"
        >
          <WalletCards :size="13" /> Positions
        </button>
        <button
          type="button"
          :class="{ active: surface === 'workspace' && section === 'orders' }"
          @click="selectWorkspace('orders')"
        >
          <ListChecks :size="13" /> Open orders
        </button>
        <button
          type="button"
          :class="{ active: surface === 'diagnostics' }"
          @click="surface = 'diagnostics'"
        >
          <Network :size="13" /> Diagnostics
        </button>
      </div>
      <EngineCommandPalette />
    </nav>

    <TradeWorkspace v-if="surface === 'workspace'" :section="section" @section="selectWorkspace" />
    <SplitView v-else storage-key="trading-terminal-split-horizontal">
      <template #left>
        <OrdersColumn />
      </template>

      <template #right>
        <EngineWorkspace />
      </template>
    </SplitView>
  </div>
</template>

<style scoped>
.terminal-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}
.terminal-views {
  display: flex;
  min-height: 40px;
  flex: none;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 0.5rem;
  background: var(--surface-muted);
  border-bottom: 1px solid var(--border-normal);
}
.view-tabs {
  display: flex;
  min-width: 0;
  align-items: stretch;
  overflow-x: auto;
}
.view-tabs button {
  display: inline-flex;
  min-height: 39px;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.8rem;
  color: var(--fg-muted);
  font-size: 12px;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--border-subtle);
}
.view-tabs button.active {
  color: var(--fg-strong);
  background: var(--surface-base);
  box-shadow: inset 0 -2px var(--accent-color);
}
.terminal-shell > :last-child {
  min-height: 0;
  flex: 1;
}
@media (max-width: 650px) {
  .terminal-views { padding-right: 0; }
  .view-tabs button { padding-inline: 0.6rem; }
}
</style>
