<script setup lang="ts">
import { computed } from 'vue'

import ProjectionActions from '@/components/engine/actions/ProjectionActions.vue'
import type { CommandProjection, ProtectionProjection } from '@/lib/gateway'
import { entityLabel, entityStatus } from '@/lib/projection/presentation'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'

interface DetailRow {
  label: string
  value: string
}

const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()

const details = computed<DetailRow[]>(() => {
  const entity = ui.selectedEntity
  if (entity === null) return []
  switch (entity.kind) {
    case 'command':
      return compact([
        row('Command', entity.row.accepted.kind),
        row('Lifecycle', entity.row.lifecycle),
        row('Accepted', formatTimestamp(entity.row.accepted_at)),
        row('Operations', String(entity.row.operation_ids.length)),
        optionalRow('Failure', entity.row.failure_reason),
      ])
    case 'order':
      return compact([
        row('Symbol', entity.row.current_request.symbol),
        row('Side', entity.row.current_request.side),
        row('Position Side', entity.row.current_request.position_side),
        row('Execution', recordValue(entity.row.current_request.execution, 'kind')),
        optionalRecordRow('Execution Price', entity.row.current_request.execution, 'price'),
        optionalRecordRow('Time In Force', entity.row.current_request.execution, 'time_in_force'),
        row('Reduce Only', yesNo(entity.row.current_request.reduce_only)),
        row('Target Quantity', entity.row.target_quantity),
        row('Filled Quantity', entity.row.filled_quantity),
        row('Remaining Quantity', entity.row.remaining_quantity),
        row('Overfill Quantity', entity.row.overfill_quantity),
        row('Generation', String(entity.row.active_generation)),
        row('Lifecycle', entity.row.lifecycle),
        row('Reconciliation Required', yesNo(entity.row.reconciliation_required)),
        optionalRow('Failure', entity.row.failure_reason),
      ])
    case 'execution_group':
      return compact([
        row('Purpose', entity.row.purpose),
        row('Lifecycle', entity.row.lifecycle),
        row('Children', String(entity.row.child_order_ids.length)),
        row('Accepted Quantity', entity.row.accepted_quantity),
        row('Target Quantity', entity.row.target_quantity),
        row('Filled Quantity', entity.row.filled_quantity),
        row('Working Children', String(entity.row.working_children)),
        row('Filled Children', String(entity.row.filled_children)),
        row('Rejected Children', String(entity.row.rejected_children)),
        row('Reconciliation Children', String(entity.row.reconciliation_children)),
      ])
    case 'chase':
      return compact([
        optionalRecordRow('Symbol', entity.row.plan, 'symbol'),
        optionalRecordRow('Position Side', entity.row.plan, 'position_side'),
        optionalRecordRow('Quantity', entity.row.plan, 'quantity'),
        row('Lifecycle', entity.row.lifecycle),
        optionalRow('Desired Price', entity.row.desired_price),
        optionalRow('Boundary Price', entity.row.resolved_boundary_price),
        optionalRow('Best Bid', entity.row.latest_bid),
        optionalRow('Best Ask', entity.row.latest_ask),
        row('Market Stale', yesNo(entity.row.market_stale)),
        row('Reprice Sequence', String(entity.row.reprice_sequence)),
        row('Reprice Ready', yesNo(entity.row.reprice_ready)),
        row('Post-only Retry', yesNo(entity.row.post_only_retry_pending)),
        optionalRow('Last Reason', entity.row.last_reason),
      ])
    case 'trailing_entry':
      return compact([
        optionalRecordRow('Symbol', entity.row.plan, 'symbol'),
        optionalRecordRow('Position Side', entity.row.plan, 'position_side'),
        optionalRecordRow('Activation Price', entity.row.plan, 'activation_price'),
        optionalRecordRow('Jump Threshold (bps)', entity.row.plan, 'jump_threshold'),
        optionalRecordRow('Stop Loss', entity.row.plan, 'stop_loss'),
        optionalRecordRow('Take Profit', entity.row.plan, 'take_profit'),
        optionalRecordRow('Risk Amount', entity.row.plan, 'risk_amount'),
        row('Phase', entity.row.phase),
        row('Lifecycle', entity.row.lifecycle),
        row('State Revision', String(entity.row.state_revision)),
        row('Market Stale', yesNo(entity.row.market_stale)),
        row('Points', String(entity.row.point_count)),
        optionalRow('Actual Activation', entity.row.actual_activation_price),
        optionalRow('Peak', entity.row.peak),
        row('Entry Cancel Requested', yesNo(entity.row.entry_cancel_requested)),
        optionalRow('Last Reason', entity.row.last_reason),
      ])
    case 'close_workflow':
      return compact([
        row('Symbol', entity.row.symbol),
        row('Position Side', entity.row.position_side),
        row('Lifecycle', entity.row.lifecycle),
        row('Close All', yesNo(entity.row.close_all)),
        row('Requested Quantity', entity.row.requested_quantity),
        row('External Quantity', entity.row.requested_external_quantity),
        row('Sources', String(entity.row.source_command_ids.length)),
        optionalRow('Last Reason', entity.row.last_reason),
      ])
    case 'flatten_workflow':
      return compact([
        row('Lifecycle', entity.row.lifecycle),
        row('Target', formatRecord(entity.row.target)),
        row('Affected Commands', String(entity.row.affected_command_ids.length)),
        row('Close Workflows', String(entity.row.close_workflow_ids.length)),
        optionalRow('Last Reason', entity.row.last_reason),
      ])
  }
  return []
})

const relatedExecutions = computed(() => {
  const entity = ui.selectedEntity
  if (entity?.kind !== 'order') return []
  return (ui.graph?.executions ?? []).filter(
    (execution) => execution.order?.order_id === entity.row.order_id,
  )
})

const relatedProtections = computed(() => {
  const entity = ui.selectedEntity
  if (entity?.kind !== 'order') return []
  const command = (projections.selectedLive?.commands ?? []).find(
    (candidate) => candidate.command_id === entity.row.command_id,
  )
  const scopeId = command === undefined ? null : commandProtectionScopeId(command)
  const clientIds = new Set<string>()
  for (const generation of Object.values(entity.row.generations)) {
    clientIds.add(generation.client_order_id)
  }
  return (projections.selectedLive?.protections ?? []).filter(
    (protection) =>
      (scopeId !== null && protectionOwnerScopeId(protection) === scopeId) ||
      (protection.client_order_id !== null && clientIds.has(protection.client_order_id)) ||
      (protection.parent_client_order_id !== null &&
        clientIds.has(protection.parent_client_order_id)),
  )
})

function commandProtectionScopeId(command: CommandProjection): string | null {
  const protection = objectValue(command.accepted.parameters.protection)
  return stringValue(protection?.scope_id)
}

function protectionOwnerScopeId(protection: ProtectionProjection): string | null {
  const classification = objectValue(protection.inventory_classification)
  if (classification?.kind !== 'owned') return null
  return stringValue(objectValue(classification.owner)?.scope_id)
}

function row(label: string, value: string): DetailRow {
  return { label, value }
}

function optionalRow(label: string, value: string | null): DetailRow | null {
  return value === null ? null : row(label, value)
}

function optionalRecordRow(
  label: string,
  value: Record<string, unknown>,
  key: string,
): DetailRow | null {
  const found = value[key]
  return found === undefined || found === null ? null : row(label, formatValue(found))
}

function recordValue(value: Record<string, unknown>, key: string): string {
  return formatValue(value[key] ?? 'unknown')
}

function compact(values: Array<DetailRow | null>): DetailRow[] {
  return values.filter((value): value is DetailRow => value !== null)
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

function formatRecord(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${formatValue(item)}`)
    .join(', ')
}

function formatValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null || value === undefined) return '-'
  return JSON.stringify(value)
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
</script>

<template>
  <section class="details-panel" data-testid="projection-details">
    <header class="panel-header">
      <span class="panel-title">Details</span>
      <span v-if="ui.selectedEntity" class="detail-status">
        {{ entityStatus(ui.selectedEntity) }}
      </span>
    </header>

    <div v-if="ui.selectedEntity" class="details-scroll">
      <div class="entity-heading">
        <div class="entity-title">{{ entityLabel(ui.selectedEntity) }}</div>
        <div class="entity-id">{{ ui.selectedEntity.id }}</div>
      </div>

      <ProjectionActions />

      <div class="detail-grid">
        <div v-for="item in details" :key="item.label" class="detail-cell">
          <span class="detail-label">{{ item.label }}</span>
          <span class="detail-value">{{ item.value }}</span>
        </div>
      </div>

      <section v-if="relatedExecutions.length" class="evidence-section">
        <h3>Executions</h3>
        <div v-for="execution in relatedExecutions" :key="execution.event_id" class="evidence-row">
          <span>{{ execution.fill.quantity }} @ {{ execution.fill.price }}</span>
          <span>{{
            execution.fill.is_maker === true
              ? 'maker'
              : execution.fill.is_maker === false
                ? 'taker'
                : 'unknown'
          }}</span>
          <span>{{ formatTimestamp(execution.fill.occurred_at) }}</span>
          <span v-if="execution.fill.fee">
            Fee {{ execution.fill.fee.amount }} {{ execution.fill.fee.asset }}
          </span>
          <span v-if="execution.fill.builder_fee">
            Builder {{ execution.fill.builder_fee.amount }} {{ execution.fill.builder_fee.asset }}
          </span>
          <span v-if="execution.fill.realized_pnl">
            PnL {{ execution.fill.realized_pnl.amount }} {{ execution.fill.realized_pnl.asset }}
          </span>
        </div>
      </section>

      <section v-if="relatedProtections.length" class="evidence-section">
        <h3>Exchange Protection</h3>
        <div
          v-for="protection in relatedProtections"
          :key="protection.remote_order_id"
          class="evidence-row"
        >
          <span>{{ protection.protection_kind }} @ {{ protection.trigger_price }}</span>
          <span>{{ protection.status }}</span>
          <span
            >{{ protection.cumulative_filled_quantity }} / {{ protection.original_quantity }}</span
          >
        </div>
      </section>
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

.detail-status {
  margin-left: auto;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.details-scroll {
  min-height: 0;
  overflow: auto;
}

.entity-heading {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.entity-title {
  font-size: 14px;
  color: var(--color-text);
}

.entity-id {
  margin-top: 4px;
  color: var(--color-text-dim);
  font-size: 11px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--border-color);
}

.detail-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 8px 12px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.detail-label {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

.detail-value {
  overflow-wrap: anywhere;
  color: var(--color-text);
}

.evidence-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

.evidence-section h3 {
  margin: 0 0 8px;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: normal;
  text-transform: uppercase;
}

.evidence-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  padding: 5px 0;
  color: var(--color-text-dim);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
}

.empty-state {
  padding: 18px;
  color: var(--color-text-dim);
  text-align: center;
}

@media (max-width: 720px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
