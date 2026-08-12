<script setup lang="ts">
import { computed } from 'vue'

import ProjectionActions from '@/components/engine/actions/ProjectionActions.vue'
import ChaseDetails from '@/components/engine/details/ChaseDetails.vue'
import CommandDetails from '@/components/engine/details/CommandDetails.vue'
import ExecutionEvidence from '@/components/engine/details/ExecutionEvidence.vue'
import ExecutionGroupDetails from '@/components/engine/details/ExecutionGroupDetails.vue'
import OperationalDetails from '@/components/engine/details/OperationalDetails.vue'
import OrderDetails from '@/components/engine/details/OrderDetails.vue'
import ProtectionEvidence from '@/components/engine/details/ProtectionEvidence.vue'
import TrailingEntryDetails from '@/components/engine/details/TrailingEntryDetails.vue'
import NativeProtectionDetails from '@/components/engine/details/NativeProtectionDetails.vue'
import {
  activeProtectionAmendment,
  commandNativeProtection,
} from '@/lib/engineCommands/protectionAmendment'
import type { CommandProjection, ProtectionProjection } from '@/lib/gateway'
import { nodeKey } from '@/lib/projection'
import {
  commandProtectionScopeId,
  entityCommandId,
  entityLabel,
  entityStatus,
  type ProjectionEntity,
} from '@/lib/projection/presentation'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'

withDefaults(defineProps<{ showActions?: boolean }>(), { showActions: true })

type OperationalEntity = Extract<
  ProjectionEntity,
  {
    kind:
      | 'close_workflow'
      | 'flatten_workflow'
      | 'entry_cancellation'
      | 'account_control'
      | 'protection_amendment'
  }
>

const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()

const entity = computed(() => ui.selectedEntity)
const directlySelectedProtection = computed(() => ui.selectedProtection)
const selectedCommand = computed<CommandProjection | null>(() => {
  if (entity.value === null || ui.graph === null) return null
  const commandId = entityCommandId(entity.value)
  return ui.graph.commands.find((command) => command.command_id === commandId) ?? null
})
const evidenceOrderIds = computed(() => {
  const selected = entity.value
  if (selected === null || ui.graph === null) return new Set<string>()
  const descendants = descendantKeys(nodeKey({ kind: selected.kind, id: selected.id }))
  if (selected.kind === 'order') descendants.add(nodeKey({ kind: 'order', id: selected.id }))
  return new Set(
    ui.graph.orders
      .filter((order) => descendants.has(nodeKey({ kind: 'order', id: order.order_id })))
      .map((order) => order.order_id),
  )
})
const evidenceOrders = computed(() =>
  (ui.graph?.orders ?? []).filter((order) => evidenceOrderIds.value.has(order.order_id)),
)
const relatedExecutions = computed(() =>
  (ui.graph?.executions ?? []).filter(
    (execution) => execution.order !== null && evidenceOrderIds.value.has(execution.order.order_id),
  ),
)
const selectedNativeProtection = computed(() => {
  const command = selectedCommand.value
  const live = projections.selectedLive
  if (command === null || live === null) return null
  return commandNativeProtection(command, live.native_protections)
})
const selectedProtectionAmendment = computed(() =>
  activeProtectionAmendment(
    selectedNativeProtection.value,
    projections.selectedLive?.protection_amendments ?? [],
  ),
)
const relatedProtections = computed(() => {
  const command = selectedCommand.value
  if (command === null) return []
  const scopeId = commandProtectionScopeId(command)
  const clientIds = new Set<string>()
  for (const order of evidenceOrders.value) {
    for (const generation of Object.values(order.generations)) {
      clientIds.add(generation.client_order_id)
    }
  }
  return (projections.selectedLive?.protections ?? []).filter(
    (protection) =>
      (scopeId !== null && protectionOwnerScopeId(protection) === scopeId) ||
      (protection.client_order_id !== null && clientIds.has(protection.client_order_id)) ||
      (protection.parent_client_order_id !== null &&
        clientIds.has(protection.parent_client_order_id)),
  )
})
const directlySelectedExchangeProtections = computed(() => {
  const protection = directlySelectedProtection.value
  if (protection === null) return []
  const remoteIds = new Set(
    Object.values(protection.children).flatMap((child) => child.remote_order_ids),
  )
  return (projections.selectedLive?.protections ?? []).filter((row) =>
    remoteIds.has(row.remote_order_id),
  )
})
const operationalEntity = computed<OperationalEntity | null>(() => {
  const selected = entity.value
  return selected !== null && isOperational(selected) ? selected : null
})
const selectedId = computed(
  () => directlySelectedProtection.value?.protection_id ?? entity.value?.id ?? null,
)
const acceptedAt = computed(() => selectedCommand.value?.accepted_at ?? null)
const detailStatus = computed(
  () =>
    directlySelectedProtection.value?.status ??
    (entity.value === null ? null : entityStatus(entity.value)),
)
const detailTone = computed(() => statusTone(detailStatus.value))

function descendantKeys(root: string): Set<string> {
  const result = new Set([root])
  let priorSize = -1
  while (result.size !== priorSize) {
    priorSize = result.size
    for (const edge of ui.graph?.relationships ?? []) {
      if (result.has(nodeKey(edge.parent))) result.add(nodeKey(edge.child))
    }
  }
  return result
}

function protectionOwnerScopeId(protection: ProtectionProjection): string | null {
  const classification = objectValue(protection.inventory_classification)
  if (classification?.kind !== 'owned') return null
  const owner = objectValue(classification.owner)
  return typeof owner?.scope_id === 'string' ? owner.scope_id : null
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isOperational(value: ProjectionEntity): value is OperationalEntity {
  return [
    'close_workflow',
    'flatten_workflow',
    'entry_cancellation',
    'account_control',
    'protection_amendment',
  ].includes(value.kind)
}

function statusTone(status: string | null): string {
  const value = status?.toLowerCase() ?? ''
  if (value.includes('fail') || value.includes('reject') || value.includes('reconciliation')) {
    return 'error'
  }
  if (value.includes('cancel')) return 'canceled'
  if (['succeeded', 'filled', 'completed', 'flat'].includes(value)) return 'complete'
  if (['running', 'working', 'tracking', 'triggered', 'installing', 'resizing'].includes(value)) {
    return 'active'
  }
  return 'neutral'
}

function formatDate(value: number | null): string {
  return value === null ? '-' : new Date(value).toLocaleString()
}
</script>

<template>
  <section class="details-panel" :class="`details-${detailTone}`" data-testid="projection-details">
    <header class="panel-header">
      <span class="panel-title">Device Details</span>
    </header>

    <div v-if="directlySelectedProtection" class="details-scroll">
      <div class="entity-meta">
        <span
          >Device ID: <strong>{{ selectedId }}</strong></span
        >
        <span>Created: <strong>-</strong></span>
      </div>
      <ProjectionActions v-if="showActions" />
      <NativeProtectionDetails
        :protection="directlySelectedProtection"
        :exchange-protections="directlySelectedExchangeProtections"
      />
    </div>
    <div v-else-if="entity" class="details-scroll">
      <div class="entity-meta">
        <span
          >Device ID: <strong>{{ selectedId }}</strong></span
        >
        <span
          >Created: <strong>{{ formatDate(acceptedAt) }}</strong></span
        >
      </div>
      <div class="entity-heading">
        <div class="entity-title">{{ entityLabel(entity) }} Device</div>
        <span class="entity-status">{{ detailStatus }}</span>
      </div>

      <ProjectionActions v-if="showActions" />

      <CommandDetails v-if="entity.kind === 'command'" :command="entity.row" />
      <OrderDetails v-else-if="entity.kind === 'order'" :order="entity.row" />
      <ExecutionGroupDetails v-else-if="entity.kind === 'execution_group'" :group="entity.row" />
      <ChaseDetails v-else-if="entity.kind === 'chase'" :chase="entity.row" />
      <TrailingEntryDetails
        v-else-if="entity.kind === 'trailing_entry'"
        :trailing-entry="entity.row"
      />
      <OperationalDetails v-else-if="operationalEntity" :entity="operationalEntity" />

      <ExecutionEvidence :executions="relatedExecutions" />
      <ProtectionEvidence
        :native-protection="selectedNativeProtection"
        :exchange-protections="relatedProtections"
        :amendment="selectedProtectionAmendment"
      />
    </div>
    <div v-else class="empty-state">Select a command or execution entity</div>
  </section>
</template>

<style scoped>
.details-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.details-scroll {
  min-height: 0;
  overflow: auto;
}

.details-error {
  background: color-mix(in srgb, var(--color-error) 9%, transparent);
}
.details-canceled {
  background: color-mix(in srgb, var(--color-error) 6%, transparent);
}
.details-complete {
  background: color-mix(in srgb, var(--color-success) 7%, transparent);
}
.details-active {
  background: color-mix(in srgb, var(--color-warning) 7%, transparent);
}

.entity-meta {
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  color: var(--color-text-dim);
  display: flex;
  font-size: 10px;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
}

.entity-meta strong {
  color: var(--color-text);
  font-weight: normal;
}

.entity-heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 5px;
  border-bottom: 1px solid var(--border-color);
}

.entity-title {
  font-size: 14px;
  color: var(--color-text);
}

.entity-status {
  border: 1px solid currentColor;
  color: var(--color-text-dim);
  font-size: 10px;
  padding: 2px 7px;
  text-transform: uppercase;
}
</style>
