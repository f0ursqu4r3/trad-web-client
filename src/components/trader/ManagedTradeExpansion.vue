<script setup lang="ts">
import { computed } from 'vue'

import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import ProjectionTreeNode from '@/components/engine/ProjectionTreeNode.vue'
import DagViewer, { type DagNode } from '@/components/general/DagViewer.vue'
import type { BrowserAccountSnapshot, ProjectionNodeId } from '@/lib/gateway'
import {
  commandTree,
  entityStatus,
  type ProjectionTreeNode as TradeTreeNode,
} from '@/lib/projection/presentation'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { useProjectionUiStore } from '@/stores/projectionUi'
import TradeHistoryPanel from './TradeHistoryPanel.vue'
import TradeOrdersPanel from './TradeOrdersPanel.vue'

type ExpansionTab = 'orders' | 'devices' | 'graph' | 'history'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
}>()

const ui = useProjectionUiStore()
const activeTab = defineModel<ExpansionTab>('activeTab', { default: 'orders' })
const tabs: ExpansionTab[] = ['orders', 'devices', 'graph', 'history']
const tree = computed(() => commandTree(props.snapshot, props.trade.primaryCommand.command_id))
const dag = computed(() => (tree.value === null ? null : dagNode(tree.value)))

function chooseTab(tab: ExpansionTab): void {
  activeTab.value = tab
  ui.selectCommand(props.trade.primaryCommand.command_id)
}

function selectDagNode(node: DagNode): void {
  const divider = node.id.indexOf(':')
  if (divider <= 0) return
  ui.selectEntity({
    kind: node.id.slice(0, divider) as ProjectionNodeId['kind'],
    id: node.id.slice(divider + 1),
  })
}

function dagNode(value: TradeTreeNode): DagNode {
  return {
    id: `${value.entity.kind}:${value.entity.id}`,
    title: value.entity.kind.replace(/_/g, ' '),
    status: terminalStatus(entityStatus(value.entity)) ? 'done' : 'not-sent',
    children: value.children.map(dagNode),
  }
}

function terminalStatus(value: string): boolean {
  return ['succeeded', 'failed', 'canceled', 'filled', 'completed', 'flat', 'rejected'].includes(
    value,
  )
}
</script>

<template>
  <div class="trade-expansion">
    <nav class="expansion-tabs" aria-label="Trade details">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="{ active: activeTab === tab }"
        type="button"
        @click="chooseTab(tab)"
      >
        {{ tab === 'orders' ? 'Orders & protection' : tab }}
      </button>
    </nav>

    <TradeOrdersPanel v-if="activeTab === 'orders'" :trade="trade" />
    <div v-else-if="activeTab === 'devices'" class="expansion-content devices-content">
      <div class="device-tree"><ProjectionTreeNode v-if="tree" :tree="tree" /></div>
      <div class="device-detail"><ProjectionDetails :show-actions="false" /></div>
    </div>
    <div v-else-if="activeTab === 'graph'" class="expansion-content graph-content">
      <DagViewer v-if="dag" :model="dag" @node-select="selectDagNode" />
      <p v-else class="empty-copy">No relationship graph is available.</p>
    </div>
    <TradeHistoryPanel v-else :trade="trade" />
  </div>
</template>

<style scoped>
.trade-expansion {
  border-top: 1px solid var(--border-normal);
  background: var(--surface-sunken);
}
.expansion-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-normal);
}
.expansion-tabs button {
  min-height: 36px;
  padding: 0 0.85rem;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-right: 1px solid var(--border-subtle);
}
.expansion-tabs button.active {
  color: var(--fg-strong);
  background: var(--surface-base);
  box-shadow: inset 0 -2px var(--accent-color);
}
.expansion-content {
  min-height: 180px;
  background: var(--surface-base);
}
.devices-content {
  display: grid;
  min-height: 330px;
  grid-template-columns: minmax(250px, 0.8fr) minmax(360px, 1.2fr);
}
.device-tree {
  overflow: auto;
  border-right: 1px solid var(--border-normal);
}
.device-detail {
  min-width: 0;
  overflow: auto;
}
.graph-content {
  height: 380px;
}
.empty-copy {
  margin: 0;
  padding: 1rem;
  color: var(--fg-muted);
}
@media (max-width: 760px) {
  .devices-content {
    grid-template-columns: 1fr;
  }
  .device-tree {
    max-height: 240px;
    border-right: 0;
    border-bottom: 1px solid var(--border-normal);
  }
  .expansion-tabs {
    overflow-x: auto;
  }
  .expansion-tabs button {
    white-space: nowrap;
  }
}
</style>
