import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AccountProjectionSummary,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandLifecycle,
  CommandProjection,
  ExecutionProjection,
  OrderProjection,
  PresentationRelationship,
  ProjectionCheckpoint,
} from '../../gateway/index.ts'
import {
  ProjectionStateError,
  applyDelta,
  combinedProjection,
  installSnapshot,
  mergeHistoryPage,
} from '../accountProjection.ts'

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

test('a contiguous delta advances authority without mutating its input', () => {
  const initial = snapshot(4, [command('a', 10, 'running')])
  const view = installSnapshot(initial)
  const next = applyDelta(view, delta(initial, 5, [command('a', 10, 'succeeded')]))

  assert.equal(next.live.checkpoint.projection_revision, 5)
  assert.equal(next.live.commands[0]?.lifecycle, 'succeeded')
  assert.equal(view.live.checkpoint.projection_revision, 4)
  assert.equal(view.live.commands[0]?.lifecycle, 'running')
})

test('a revision gap is rejected before any state changes', () => {
  const view = installSnapshot(snapshot(4, [command('a', 10, 'running')]))
  const before = structuredClone(view)

  assert.throws(
    () => applyDelta(view, delta(view.live, 6, [command('a', 10, 'succeeded')])),
    errorWithCode('revision_gap'),
  )
  assert.deepEqual(view, before)
})

test('a replacement snapshot clears history and changes shard authority', () => {
  const first = installSnapshot(snapshot(4, [command('a', 10, 'succeeded')]))
  const withHistory = mergeHistoryPage(first, historyPage(first.live, command('z', 1, 'failed')))
  const replacement = snapshot(1, [command('b', 20, 'running')], 'bybit')
  const installed = installSnapshot(replacement)

  assert.notEqual(withHistory.history, null)
  assert.equal(installed.history, null)
  assert.equal(installed.live.checkpoint.shard.exchange, 'bybit')
  assert.deepEqual(
    installed.live.commands.map((row) => row.command_id),
    ['b'],
  )
})

test('terminal pruning retains running roots, newest terminals, and their descendants', () => {
  const commands = [
    command('terminal-old', 10, 'failed'),
    command('terminal-new', 20, 'succeeded'),
    command('running', 5, 'running'),
  ]
  const orders = [order('order-old'), order('order-new'), order('order-running')]
  const relationships = [
    relationship('terminal-old', 'order-old'),
    relationship('terminal-new', 'order-new'),
    relationship('running', 'order-running'),
  ]
  const initial = snapshot(1, commands, 'hyperliquid', 1, orders, relationships, [
    execution('fill-old', 'order-old'),
    execution('fill-new', 'order-new'),
    execution('fill-running', 'order-running'),
    execution('fill-unmatched', null),
  ])
  const next = applyDelta(view(initial), delta(initial, 2, []))

  assert.deepEqual(ids(next.live.commands, 'command_id'), ['running', 'terminal-new'])
  assert.deepEqual(ids(next.live.orders, 'order_id'), ['order-new', 'order-running'])
  assert.deepEqual(ids(next.live.executions, 'event_id'), [
    'fill-new',
    'fill-running',
    'fill-unmatched',
  ])
  assert.equal(next.live.window.included_commands, 2)
  assert.equal(next.live.window.total_commands, 3)
  assert.equal(next.live.window.older_terminal_commands_available, true)
})

test('equal-time terminal pruning follows the server command-id tie break', () => {
  const initial = snapshot(
    1,
    [command('a', 10, 'failed'), command('b', 10, 'succeeded')],
    'hyperliquid',
    1,
  )
  const next = applyDelta(view(initial), delta(initial, 2, []))

  assert.deepEqual(ids(next.live.commands, 'command_id'), ['b'])
})

test('matching terminal history pages accumulate and live rows win combined projection', () => {
  const liveCommand = command('recent', 30, 'succeeded')
  const current = view(snapshot(8, [liveCommand]))
  const first = mergeHistoryPage(
    current,
    historyPage(current.live, command('older-1', 20, 'failed')),
  )
  const second = mergeHistoryPage(
    first,
    historyPage(current.live, command('older-2', 10, 'canceled')),
  )
  const combined = combinedProjection(second)

  assert.deepEqual(ids(combined.commands, 'command_id'), ['older-1', 'older-2', 'recent'])
  assert.deepEqual(second.history?.root_command_ids, ['older-1', 'older-2'])
})

test('a stale history page is rejected', () => {
  const current = view(snapshot(8, [command('recent', 30, 'succeeded')]))
  const stale = historyPage(current.live, command('older', 20, 'failed'))
  stale.checkpoint = checkpoint(7, 2)

  assert.throws(() => mergeHistoryPage(current, stale), errorWithCode('history_revision_mismatch'))
})

test('an advancing live delta invalidates revision-pinned history', () => {
  const current = view(snapshot(8, [command('recent', 30, 'succeeded')]))
  const withHistory = mergeHistoryPage(
    current,
    historyPage(current.live, command('older', 20, 'failed')),
  )
  const next = applyDelta(withHistory, delta(current.live, 9, []))

  assert.equal(next.history, null)
})

test('history rejects a nonterminal root and dangling relationships', () => {
  const current = view(snapshot(8, [command('recent', 30, 'succeeded')]))
  const nonterminal = historyPage(current.live, command('running', 20, 'running'))
  assert.throws(() => mergeHistoryPage(current, nonterminal), errorWithCode('invalid_history_page'))

  const dangling = historyPage(current.live, command('older', 20, 'failed'))
  dangling.relationships.push(relationship('older', 'missing-order'))
  assert.throws(() => mergeHistoryPage(current, dangling), errorWithCode('invalid_history_page'))
})

test('unsafe numeric revisions are rejected rather than rounded', () => {
  const unsafe = snapshot(Number.MAX_SAFE_INTEGER + 1, [])
  assert.throws(() => installSnapshot(unsafe), errorWithCode('invalid_revision'))
})

function view(value: BrowserAccountSnapshot) {
  return installSnapshot(value)
}

function snapshot(
  revision: number,
  commands: CommandProjection[],
  exchange: 'hyperliquid' | 'bybit' = 'hyperliquid',
  terminalLimit = 250,
  orders: OrderProjection[] = [],
  relationships: PresentationRelationship[] = [],
  executions: ExecutionProjection[] = [],
): BrowserAccountSnapshot {
  return {
    checkpoint: checkpoint(revision, commands.length, exchange),
    window: {
      total_commands: commands.length,
      included_commands: commands.length,
      terminal_command_limit: terminalLimit,
      older_terminal_commands_available: false,
    },
    commands,
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    orders,
    positions: [],
    executions,
    balances: [],
    protections: [],
    relationships,
  }
}

function delta(
  current: BrowserAccountSnapshot,
  revision: number,
  commands: CommandProjection[],
): BrowserAccountDelta {
  return {
    checkpoint: checkpoint(
      revision,
      current.checkpoint.summary.commands,
      current.checkpoint.shard.exchange as 'hyperliquid' | 'bybit',
    ),
    commands,
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships: [],
  }
}

function historyPage(current: BrowserAccountSnapshot, root: CommandProjection): ClientCommandPage {
  return {
    checkpoint: current.checkpoint,
    root_command_ids: [root.command_id],
    commands: [root],
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    orders: [],
    executions: [],
    relationships: [],
    next_cursor: null,
  }
}

function checkpoint(
  revision: number,
  commandCount: number,
  exchange: 'hyperliquid' | 'bybit' = 'hyperliquid',
): ProjectionCheckpoint {
  return {
    schema_version: 20,
    shard: { exchange, network: 'testnet', account_id: ACCOUNT_ID },
    account_revision: revision,
    projection_revision: revision,
    summary: summary(commandCount),
  }
}

function summary(commands: number): AccountProjectionSummary {
  return {
    private_stream_generation: null,
    private_stream_status: 'connected',
    reconciliation_cycle_id: null,
    reconciliation_generation: null,
    reconciliation_status: 'ready',
    reconciliation_ready: true,
    position_inventory_ready: true,
    commands,
    execution_groups: 0,
    active_execution_groups: 0,
    chases: 0,
    active_chases: 0,
    trailing_entries: 0,
    active_trailing_entries: 0,
    close_workflows: 0,
    active_close_workflows: 0,
    flatten_workflows: 0,
    active_flatten_workflows: 0,
    orders: 0,
    active_orders: 0,
    positions: 0,
    executions: 0,
    unmatched_executions: 0,
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

function command(id: string, acceptedAt: number, lifecycle: CommandLifecycle): CommandProjection {
  return {
    command_id: id,
    accepted_at: acceptedAt,
    accepted: { kind: 'place_order', parameters: {} },
    root: { kind: 'order', id: `order-${id}` },
    operation_ids: [],
    lifecycle,
    failure_reason: null,
  }
}

function order(id: string): OrderProjection {
  return { order_id: id } as OrderProjection
}

function execution(eventId: string, orderId: string | null): ExecutionProjection {
  return {
    event_id: eventId,
    order: orderId === null ? null : { order_id: orderId, generation: 0 },
  } as ExecutionProjection
}

function relationship(commandId: string, orderId: string): PresentationRelationship {
  return {
    parent: { kind: 'command', id: commandId },
    child: { kind: 'order', id: orderId },
    relationship: 'command_root',
  }
}

function ids<T>(rows: T[], key: keyof T): unknown[] {
  return rows.map((row) => row[key])
}

function errorWithCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof ProjectionStateError && error.code === code
}
