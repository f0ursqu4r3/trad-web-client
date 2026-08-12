<script setup lang="ts">
import { computed } from 'vue'

import ProjectionTreeRow from './ProjectionTreeRow.vue'
import { terminalCommandTree } from '@/lib/projection/terminalPresentation'
import { commandSymbol } from '@/lib/projection/presentation'
import { formatAccountProduct } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useProjectionUiStore } from '@/stores/projectionUi'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const projectionUi = useProjectionUiStore()

const account = computed(() => accounts.selectedAccount)
const tree = computed(() => {
  const graph = projectionUi.graph
  const snapshot = projections.selectedLive
  const commandId = projectionUi.selectedCommandId
  if (graph === null || snapshot === null || commandId === null) return null
  return terminalCommandTree(graph, snapshot, commandId)
})
const symbol = computed(() => {
  const graph = projectionUi.graph
  const command = projectionUi.selectedCommand
  return graph === null || command === null ? null : commandSymbol(command, graph)
})
</script>

<template>
  <div class="projection-tree-panel">
    <div v-if="account" class="market-context-strip">
      <span class="context-label">Exchange</span>
      <span class="context-value">{{ account.exchange }}</span>
      <span class="context-label">Product</span>
      <span class="context-value">{{ formatAccountProduct(account.exchange_metadata?.product) ?? '-' }}</span>
      <span class="context-label">Account</span>
      <span class="context-value" :title="account.id">{{ account.id.slice(0, 8) }}...</span>
      <span v-if="symbol" class="context-label">Symbol</span>
      <span v-if="symbol" class="context-value">{{ symbol }}</span>
    </div>
    <ProjectionTreeRow v-if="tree" :node="tree" />
    <div v-else class="empty-state">No command selected</div>
  </div>
</template>

<style scoped>
.projection-tree-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.market-context-strip {
  align-items: center;
  border: 1px solid var(--border-color);
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 8px;
  padding: 8px;
}

.context-label {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
}

.context-value {
  color: var(--color-info);
  font-family: var(--font-mono);
  font-size: 10px;
}

.empty-state {
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 12px;
}
</style>
