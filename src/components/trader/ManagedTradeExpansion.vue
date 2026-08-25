<script setup lang="ts">
import { computed } from 'vue'

import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import DagViewer, { type DagNode } from '@/components/general/DagViewer.vue'
import ExecutionTreeView, {
  type ExecutionTreeItem,
} from '@/components/terminal/presentation/ExecutionTreeView.vue'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import { terminalCommandTree, type TerminalTreeNode } from '@/lib/projection/terminalPresentation'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { useProjectionUiStore } from '@/stores/projectionUi'
import ManagedTradeChart from './ManagedTradeChart.vue'
import TradeHistoryPanel from './TradeHistoryPanel.vue'
import TradeOrdersPanel from './TradeOrdersPanel.vue'

type ExpansionTab = 'orders' | 'chart' | 'devices' | 'sequence' | 'history'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
}>()

const ui = useProjectionUiStore()
const activeTab = defineModel<ExpansionTab>('activeTab', { default: 'orders' })
const tabs: ExpansionTab[] = ['orders', 'chart', 'devices', 'sequence', 'history']
const tree = computed(() =>
  terminalCommandTree(props.snapshot, props.snapshot, props.trade.primaryCommand.command_id),
)
const dag = computed(() => (tree.value === null ? null : dagNode(tree.value)))
const selectedTreeId = computed(() => {
  if (ui.selectedProtectionId !== null) return `native_protection:${ui.selectedProtectionId}`
  if (ui.selectedProtectionChild !== null) {
    return `protection_child:${ui.selectedProtectionChild.protectionId}:${ui.selectedProtectionChild.childId}`
  }
  if (ui.selectedOrderGeneration !== null) {
    return `order_generation:${ui.selectedOrderGeneration.orderId}:${ui.selectedOrderGeneration.generation}`
  }
  return ui.selectedNode === null ? null : `${ui.selectedNode.kind}:${ui.selectedNode.id}`
})

function chooseTab(tab: ExpansionTab): void {
  activeTab.value = tab
  ui.selectCommand(props.trade.primaryCommand.command_id)
}

function selectDagNode(node: DagNode): void {
  selectTreeNode(node.id)
}

function selectTreeNode(id: string): void {
  const item = tree.value === null ? null : findNode(tree.value, id)?.entity
  if (item?.kind === 'projection') ui.selectEntity(item.node)
  if (item?.kind === 'native_protection') ui.selectProtection(item.id)
  if (item?.kind === 'protection_child') {
    ui.selectProtectionChild(item.protectionId, item.childId)
  }
  if (item?.kind === 'order_generation') {
    ui.selectOrderGeneration(item.orderId, item.generation)
  }
}

function findNode(node: TerminalTreeNode, id: string): TerminalTreeNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found !== null) return found
  }
  return null
}

function dagNode(value: TerminalTreeNode): DagNode {
  return {
    id: value.id,
    title: graphLabel(value),
    status: graphStatus(value.status),
    children: value.children.map(dagNode),
  }
}

function graphLabel(value: TerminalTreeNode): string {
  if (value.kind === 'order_generation') return value.label.replace('Order Generation', 'Gen')
  if (value.kind === 'native_protection') return 'Protection'
  return value.label
}

function graphStatus(value: string): string {
  const status = value.toLowerCase()
  if (['succeeded', 'canceled', 'filled', 'completed', 'flat'].includes(status)) return 'done'
  if (['failed', 'rejected', 'blocked'].includes(status)) return 'failed'
  if (['running', 'working', 'tracking'].includes(status)) return 'active'
  return 'not-sent'
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
    <div v-else-if="activeTab === 'chart'" class="expansion-content chart-content">
      <ManagedTradeChart :trade="trade" :snapshot="snapshot" />
    </div>
    <div v-else-if="activeTab === 'devices'" class="expansion-content devices-content">
      <div class="device-tree" data-testid="managed-trade-device-tree">
        <ExecutionTreeView
          :items="tree === null ? [] : ([tree] as ExecutionTreeItem[])"
          :selected-id="selectedTreeId"
          empty-text="No execution devices are available for this trade."
          @select="selectTreeNode"
        />
      </div>
      <div class="device-detail"><ProjectionDetails :show-actions="false" /></div>
    </div>
    <div
      v-else-if="activeTab === 'sequence'"
      class="expansion-content sequence-content"
      data-testid="managed-trade-sequence"
    >
      <DagViewer
        v-if="dag"
        :model="dag"
        :theme-vars="{ radius: '0px', radiusLg: '0px', radiusXl: '0px' }"
        @node-select="selectDagNode"
      />
      <p v-else class="empty-copy">No execution sequence is available.</p>
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
  min-height: 440px;
  grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.25fr);
}
.device-tree {
  overflow: auto;
  border-right: 1px solid var(--border-normal);
}
.device-detail {
  min-width: 0;
  overflow: auto;
}
.chart-content,
.sequence-content {
  height: 460px;
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
