import type {
  AccountProjectionSummary,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  CommandProjection,
  ProjectionCheckpoint,
  TrailingEntryProjection,
} from '@/lib/gateway'

export const LOAD_ACCOUNT_ID = '60000000-0000-4000-8000-000000000001'
export const LOAD_SUBSCRIPTION_ID = '60000000-0000-4000-8000-000000000002'

const ACCEPTED_AT = 1_786_300_000_000

export function loadSnapshot(count: number): BrowserAccountSnapshot {
  const commands: CommandProjection[] = []
  const trailingEntries: TrailingEntryProjection[] = []
  const relationships: BrowserAccountSnapshot['relationships'] = []

  for (let index = 0; index < count; index += 1) {
    const commandId = fixtureUuid(1, index)
    const trailingEntryId = fixtureUuid(2, index)
    commands.push({
      command_id: commandId,
      accepted_at: ACCEPTED_AT + index,
      accepted: {
        kind: 'place_trailing_entry',
        parameters: { symbol: `LOAD${index % 50}`, position_side: 'long' },
      },
      root: { kind: 'trailing_entry', id: trailingEntryId },
      operation_ids: [],
      lifecycle: 'running',
      failure_reason: null,
    })
    trailingEntries.push(trailingEntry(trailingEntryId, commandId, index, 0, 1))
    relationships.push({
      parent: { kind: 'command', id: commandId },
      child: { kind: 'trailing_entry', id: trailingEntryId },
      relationship: 'command_root',
    })
  }

  return {
    checkpoint: checkpoint(1, count),
    window: {
      total_commands: count,
      included_commands: count,
      terminal_command_limit: 0,
      older_terminal_commands_available: false,
    },
    commands,
    execution_groups: [],
    chases: [],
    trailing_entries: trailingEntries,
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships,
  }
}

export function loadDelta(count: number, revision: number): BrowserAccountDelta {
  const pointCount = revision - 1
  return {
    checkpoint: checkpoint(revision, count),
    commands: [],
    execution_groups: [],
    chases: [],
    trailing_entries: Array.from({ length: count }, (_, index) =>
      trailingEntry(fixtureUuid(2, index), fixtureUuid(1, index), index, pointCount, revision),
    ),
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships: [],
  }
}

function trailingEntry(
  trailingEntryId: string,
  commandId: string,
  index: number,
  pointCount: number,
  revision: number,
): TrailingEntryProjection {
  const price = String(64_000 + (revision % 17) + index / 10_000)
  return {
    trailing_entry_id: trailingEntryId,
    command_id: commandId,
    state_revision: revision,
    mutation_command_ids: [],
    plan: {
      symbol: `LOAD${index % 50}`,
      position_side: 'long',
      activation_price: '64000',
      jump_threshold_bps: '10',
    },
    phase: 'tracking',
    lifecycle: 'running',
    market_generation: 1,
    market_stale: false,
    cursor: { source_sequence: revision },
    latest_trade: { price, source_sequence: revision },
    latest_trade_received_at: ACCEPTED_AT + revision,
    point_count: pointCount,
    actual_activation_price: '64000',
    activation_point_index: 0,
    peak: price,
    peak_point_index: pointCount,
    trigger: null,
    continuations: [],
    entry_cancel_requested: false,
    close_workflow_id: null,
    last_reason: null,
    created_at: ACCEPTED_AT + index,
  }
}

function checkpoint(revision: number, count: number): ProjectionCheckpoint {
  return {
    schema_version: 24,
    shard: { exchange: 'bifake', network: 'simulation', account_id: LOAD_ACCOUNT_ID },
    account_revision: revision,
    projection_revision: revision,
    summary: summary(count),
  }
}

function summary(count: number): AccountProjectionSummary {
  return {
    private_stream_generation: 1,
    private_stream_status: 'connected',
    reconciliation_cycle_id: null,
    reconciliation_generation: 1,
    reconciliation_status: 'ready',
    reconciliation_ready: true,
    position_inventory_ready: true,
    commands: count,
    execution_groups: 0,
    active_execution_groups: 0,
    chases: 0,
    active_chases: 0,
    trailing_entries: count,
    active_trailing_entries: count,
    close_workflows: 0,
    active_close_workflows: 0,
    flatten_workflows: 0,
    active_flatten_workflows: 0,
    entry_cancellations: 0,
    active_entry_cancellations: 0,
    account_controls: 0,
    active_account_controls: 0,
    orders: 0,
    active_orders: 0,
    positions: 0,
    executions: 0,
    unmatched_executions: 0,
    unresolved_legacy_entities: 0,
    unresolved_external_orders: 0,
    balances: 0,
    protections: 0,
    active_protections: 0,
    external_protections: 0,
    unresolved_protection_inventory: 0,
    protection_inventory_blocking_readiness: 0,
    operations: 0,
    unresolved_operations: 0,
    reconciliation_required: false,
  }
}

function fixtureUuid(domain: number, index: number): string {
  const suffix = index.toString(16).padStart(12, '0')
  return `60000000-0000-4000-800${domain}-${suffix}`
}
