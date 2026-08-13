<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import DropMenu, { type DropMenuItem } from '@/components/general/DropMenu.vue'
import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import ExecutionTreeView, {
  type ExecutionTreeItem,
} from '@/components/terminal/presentation/ExecutionTreeView.vue'
import { terminalCommandTree, type TerminalTreeNode } from '@/lib/projection/terminalPresentation'
import { commandSymbol } from '@/lib/projection/presentation'
import { lifecycleActions, type LifecycleAction } from '@/lib/engineCommands/lifecycle'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import { formatAccountProduct } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useProjectionUiStore } from '@/stores/projectionUi'

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const projectionUi = useProjectionUiStore()
const contextMenu = ref<InstanceType<typeof DropMenu> | null>(null)
const contextNode = ref<TerminalTreeNode | null>(null)
const selectedAction = ref<LifecycleAction | null>(null)
const editProtectionOpen = ref(false)

const account = computed(() => accounts.selectedAccount)
const tree = computed<TerminalTreeNode | null>(() => {
  const graph = projectionUi.graph
  const snapshot = projections.selectedLive
  const commandId = projectionUi.selectedCommandId
  if (graph === null || snapshot === null || commandId === null) return null
  const root = terminalCommandTree(graph, snapshot, commandId)
  if (root === null) return null
  return addMarketContext(root)
})
const symbol = computed(() => {
  const graph = projectionUi.graph
  const command = projectionUi.selectedCommand
  return graph === null || command === null ? null : commandSymbol(command, graph)
})
const selectedId = computed(() => {
  if (projectionUi.selectedProtectionId !== null) {
    return `native_protection:${projectionUi.selectedProtectionId}`
  }
  if (projectionUi.selectedProtectionChild !== null) {
    return `protection_child:${projectionUi.selectedProtectionChild.protectionId}:${projectionUi.selectedProtectionChild.childId}`
  }
  if (projectionUi.selectedOrderGeneration !== null) {
    return `order_generation:${projectionUi.selectedOrderGeneration.orderId}:${projectionUi.selectedOrderGeneration.generation}`
  }
  const node = projectionUi.selectedNode
  return node === null ? null : `${node.kind}:${node.id}`
})
const contextActions = computed(() => {
  const target = contextNode.value?.entity
  if (target?.kind !== 'projection') return []
  return lifecycleActions(
    target.entity,
    projectionUi.graph,
    projections.selectedLive?.positions ?? [],
  )
})
const contextProtection = computed(() => {
  const target = contextNode.value?.entity
  if (target?.kind === 'native_protection') return target.protection
  if (target?.kind === 'protection_child') return target.protection
  return null
})
const contextAmendment = computed(() =>
  activeProtectionAmendment(
    contextProtection.value,
    projections.selectedLive?.protection_amendments ?? [],
  ),
)
const canEditContextProtection = computed(
  () =>
    projections.selectedLive?.checkpoint.shard.exchange === 'hyperliquid' &&
    contextProtection.value?.status === 'tracking' &&
    contextAmendment.value === null,
)
const contextItems = computed<DropMenuItem[]>(() => {
  const node = contextNode.value
  if (node === null) return []
  return [
    ...contextActions.value.map((action) => ({
      label: action.label,
      className: action.danger ? 'text-[var(--color-error)]' : undefined,
      action: () => {
        selectedAction.value = action
      },
    })),
    ...(canEditContextProtection.value
      ? [
          {
            label: 'Edit Protection',
            action: () => {
              editProtectionOpen.value = true
            },
          },
        ]
      : []),
  ]
})

function addMarketContext(node: TerminalTreeNode): TerminalTreeNode {
  const selected = account.value
  const market = selected
    ? {
        exchange: selected.exchange,
        product: formatAccountProduct(selected.exchange_metadata?.product) ?? undefined,
        account: `${selected.id.slice(0, 8)}...`,
        network: selected.network,
      }
    : null
  return {
    ...node,
    market,
    children: node.children.map(addMarketContext),
  }
}

function findNode(node: TerminalTreeNode, id: string): TerminalTreeNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const match = findNode(child, id)
    if (match !== null) return match
  }
  return null
}

function select(id: string): void {
  if (tree.value === null) return
  const item = findNode(tree.value, id)?.entity
  if (item === undefined) return
  if (item.kind === 'projection') projectionUi.selectEntity(item.node)
  if (item.kind === 'native_protection') projectionUi.selectProtection(item.id)
  if (item.kind === 'protection_child') {
    projectionUi.selectProtectionChild(item.protectionId, item.childId)
  }
  if (item.kind === 'order_generation') {
    projectionUi.selectOrderGeneration(item.orderId, item.generation)
  }
}

async function openContext(id: string, x: number, y: number): Promise<void> {
  if (tree.value === null) return
  contextNode.value = findNode(tree.value, id)
  if (contextNode.value === null) return
  select(id)
  await nextTick()
  contextMenu.value?.openAt(x, y)
}
</script>

<template>
  <div class="projection-tree-panel" data-testid="projection-entity-tree">
    <div v-if="account" class="market-context-strip">
      <span class="context-label">Exchange</span>
      <span class="context-value">{{ account.exchange }}</span>
      <span class="context-label">Product</span>
      <span class="context-value">{{
        formatAccountProduct(account.exchange_metadata?.product) ?? '-'
      }}</span>
      <span class="context-label">Account</span>
      <span class="context-value" :title="account.id">{{ account.id.slice(0, 8) }}...</span>
      <span v-if="symbol" class="context-label">Symbol</span>
      <span v-if="symbol" class="context-value">{{ symbol }}</span>
    </div>
    <ExecutionTreeView
      :items="tree === null ? [] : ([tree] as ExecutionTreeItem[])"
      :selected-id="selectedId"
      empty-text="Select a command to view its device tree."
      @select="select"
      @context="openContext"
    />
    <DropMenu ref="contextMenu" :items="contextItems">
      <template #trigger><span /></template>
    </DropMenu>
    <LifecycleActionModal
      :open="selectedAction !== null"
      :account-id="accounts.selectedAccountId ?? ''"
      :action="selectedAction"
      @close="selectedAction = null"
    />
    <ProtectionAmendmentModal
      :open="editProtectionOpen"
      :account-id="accounts.selectedAccountId ?? ''"
      :protection="contextProtection"
      :active-amendment="contextAmendment"
      @close="editProtectionOpen = false"
    />
  </div>
</template>

<style scoped>
.projection-tree-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem;
}
.market-context-strip {
  align-items: center;
  border: 1px solid var(--border-color);
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 8px;
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
</style>
