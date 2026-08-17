import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AccountControlProjection,
  AccountProjectionSummary,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandLifecycle,
  CommandProjection,
  ExecutionProjection,
  ExternalOrderProjection,
  LegacyCommandPage,
  NativeProtectionProjection,
  OrderProjection,
  PositionProjection,
  PresentationRelationship,
  ProtectionAmendmentProjection,
  ProjectionCheckpoint,
} from '../../gateway/index.ts'
import {
  ProjectionStateError,
  applyDelta,
  combinedProjection,
  installSnapshot,
  mergeHistoryPage,
  mergeLegacyHistoryPage,
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

test('account configuration remains authoritative across projection deltas', () => {
  const accepted: CommandProjection = {
    command_id: 'configure-leverage',
    accepted_at: 10,
    accepted: {
      kind: 'set_leverage',
      parameters: { symbol: 'BTC', leverage: 5, margin_mode: 'cross' },
    },
    root: { kind: 'account_control', id: 'leverage-control' },
    operation_ids: ['leverage-operation'],
    lifecycle: 'running',
    failure_reason: null,
  }
  const applying = accountControl('applying', null)
  const initial = snapshot(4, [accepted])
  initial.account_controls = [applying]
  initial.relationships = [
    {
      parent: { kind: 'command', id: accepted.command_id },
      child: { kind: 'account_control', id: applying.control_id },
      relationship: 'command_root',
    },
  ]
  initial.checkpoint.summary.account_controls = 1
  initial.checkpoint.summary.active_account_controls = 1

  const update = delta(initial, 5, [{ ...accepted, lifecycle: 'succeeded' }])
  update.account_controls = [accountControl('succeeded', 'exchange acknowledged')]
  update.checkpoint.summary.account_controls = 1
  update.checkpoint.summary.active_account_controls = 0
  const next = applyDelta(installSnapshot(initial), update)

  assert.equal(next.live.account_controls[0]?.lifecycle, 'succeeded')
  assert.equal(next.live.account_controls[0]?.last_reason, 'exchange acknowledged')
  assert.equal(next.live.commands[0]?.lifecycle, 'succeeded')
})

test('logical native protection remains authoritative outside bounded command history', () => {
  const initial = snapshot(4, [])
  initial.native_protections = [nativeProtection('installing', 1, '0')]

  const update = delta(initial, 5, [])
  update.native_protections = [nativeProtection('tracking', 2, '0.125')]
  const next = applyDelta(installSnapshot(initial), update)

  assert.equal(next.live.native_protections.length, 1)
  assert.equal(next.live.native_protections[0]?.status, 'tracking')
  assert.equal(next.live.native_protections[0]?.plan_revision, 2)
  assert.equal(next.live.native_protections[0]?.covered_quantity, '0.125')
})

test('external order inventory changes only behind its replacement fence', () => {
  const initial = snapshot(4, [])
  initial.external_orders = [externalOrder('first', 'BTC')]

  const ordinary = applyDelta(installSnapshot(initial), delta(initial, 5, []))
  assert.equal(ordinary.live.external_orders?.[0]?.identity.value, 'first')

  const replacement = delta(ordinary.live, 6, [])
  replacement.replace_external_order_inventory = true
  replacement.external_orders = [externalOrder('second', 'ETH')]
  const next = applyDelta(ordinary, replacement)

  assert.equal(next.live.external_orders?.length, 1)
  assert.equal(next.live.external_orders?.[0]?.identity.value, 'second')
  assert.equal(next.live.external_orders?.[0]?.terms?.remaining_quantity, '0.25')
})

test('protection amendment deltas remain attached to their retained command root', () => {
  const accepted = amendmentCommand('amend-command', 20, 'running')
  const initial = snapshot(4, [accepted])
  initial.native_protections = [nativeProtection('tracking', 1, '0.125')]
  initial.protection_amendments = [protectionAmendment('applying', 0)]
  initial.relationships = [amendmentRelationship(accepted.command_id)]
  initial.checkpoint.summary.protection_amendments = 1
  initial.checkpoint.summary.active_protection_amendments = 1

  const update = delta(initial, 5, [{ ...accepted, lifecycle: 'succeeded' }])
  update.protection_amendments = [protectionAmendment('succeeded', 1)]
  update.native_protections = [nativeProtection('tracking', 2, '0.125')]
  update.checkpoint.summary.protection_amendments = 1
  update.checkpoint.summary.active_protection_amendments = 0
  const next = applyDelta(installSnapshot(initial), update)

  assert.equal(next.live.protection_amendments[0]?.lifecycle, 'succeeded')
  assert.equal(next.live.protection_amendments[0]?.completed_steps, 1)
  assert.equal(next.live.native_protections[0]?.plan_revision, 2)
  assert.equal(next.live.commands[0]?.lifecycle, 'succeeded')
})

test('terminal pruning retains a protection amendment descendant with its command', () => {
  const old = command('old', 10, 'failed')
  const amended = amendmentCommand('amend-command', 20, 'succeeded')
  const initial = snapshot(4, [old, amended], 'hyperliquid', 1)
  initial.protection_amendments = [protectionAmendment('succeeded', 1)]
  initial.relationships = [amendmentRelationship(amended.command_id)]
  initial.checkpoint.summary.protection_amendments = 1
  const next = applyDelta(installSnapshot(initial), delta(initial, 5, []))

  assert.deepEqual(ids(next.live.commands, 'command_id'), ['amend-command'])
  assert.deepEqual(ids(next.live.protection_amendments, 'amendment_id'), ['protection-amendment'])
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

test('terminal pruning retains a command that still owns live exposure', () => {
  const owner = command('owner', 10, 'succeeded')
  owner.accepted.parameters = {
    position_intent: { kind: 'open', scope_id: 'scope-live' },
  }
  const initial = snapshot(1, [owner], 'hyperliquid', 0)
  initial.positions = [positionWithOwnedExposure('scope-live', '0.125')]
  const next = applyDelta(view(initial), delta(initial, 2, []))

  assert.deepEqual(ids(next.live.commands, 'command_id'), ['owner'])
  assert.equal(next.live.window.included_commands, 1)
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

test('immutable legacy history remains separate and survives live deltas', () => {
  const initial = snapshot(8, [command('recent', 30, 'succeeded')])
  initial.checkpoint.legacy_migration = {
    run_id: 'run-1',
    source_fingerprint: digest('a'),
    commands: 1,
    devices: 1,
    active_unresolved: 1,
    forensic_audit_events: 2,
    unscoped_audit_events: 0,
    blocks_new_risk: true,
  }
  const current = mergeLegacyHistoryPage(view(initial), legacyPage())
  const next = applyDelta(current, delta(initial, 9, []))

  assert.equal(next.legacyHistory?.commands[0]?.command_id, 'legacy-command')
  assert.deepEqual(
    combinedProjection(next).commands.map((row) => row.command_id),
    ['recent'],
  )
})

test('legacy history rejects source drift, dangling graphs, and overlapping pages', () => {
  const initial = snapshot(8, [])
  initial.checkpoint.legacy_migration = {
    run_id: 'run-1',
    source_fingerprint: digest('a'),
    commands: 2,
    devices: 1,
    active_unresolved: 1,
    forensic_audit_events: 2,
    unscoped_audit_events: 0,
    blocks_new_risk: true,
  }
  const current = view(initial)
  const wrongSource = legacyPage()
  wrongSource.source_fingerprint = digest('b')
  assert.throws(
    () => mergeLegacyHistoryPage(current, wrongSource),
    errorWithCode('invalid_legacy_history_page'),
  )

  const dangling = legacyPage()
  dangling.relationships[0]!.child_id = 'missing'
  assert.throws(
    () => mergeLegacyHistoryPage(current, dangling),
    errorWithCode('invalid_legacy_history_page'),
  )

  const installed = mergeLegacyHistoryPage(current, legacyPage())
  assert.throws(
    () => mergeLegacyHistoryPage(installed, legacyPage()),
    errorWithCode('invalid_legacy_history_page'),
  )
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
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    native_protections: [],
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
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    native_protections: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships: [],
  }
}

function externalOrder(identity: string, symbol: string): ExternalOrderProjection {
  return {
    identity: { kind: 'remote', value: identity },
    classification: 'system_external',
    observation: {
      event_id: `evidence-${identity}`,
      client_order_id: null,
      remote_order_id: identity,
      status: 'working',
      cumulative_filled_quantity: '0',
      average_price: null,
      working_price: '100.125',
      working_total_quantity: '0.25',
      reject_reason: null,
    },
    terms: {
      symbol,
      order_side: 'buy',
      position_side: 'long',
      remaining_quantity: '0.25',
      reduce_only: false,
      conditional: false,
    },
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
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [],
    executions: [],
    relationships: [],
    next_cursor: null,
  }
}

function legacyPage(): LegacyCommandPage {
  return {
    run_id: 'run-1',
    source_fingerprint: digest('a'),
    root_command_ids: ['legacy-command'],
    commands: [
      {
        command_id: 'legacy-command',
        kind: 'TrailingEntryOrder',
        owner_user_id: null,
        created_at: 1,
        lifecycle: 'active',
        payload_sha256: digest('b'),
        redacted: false,
      },
    ],
    devices: [
      {
        device_id: 'legacy-device',
        command_id: 'legacy-command',
        parent_id: null,
        kind: 'trailing_entry',
        symbol: 'BTCUSDT',
        position_side: 'long',
        started_at: 1,
        completed_at: null,
        lifecycle: 'active',
        failure_reason: null,
        client_order_ids: [],
        remote_order_ids: [],
        financial_values: {},
        device_payload_sha256: digest('c'),
        state_payload_sha256: digest('d'),
      },
    ],
    relationships: [
      {
        parent_kind: 'command',
        parent_id: 'legacy-command',
        child_kind: 'trailing_entry',
        child_id: 'legacy-device',
        relationship_kind: 'command_root',
        confidence: 'proven',
      },
    ],
    unresolved_active_entities: ['legacy-device'],
    next_cursor: null,
  }
}

function checkpoint(
  revision: number,
  commandCount: number,
  exchange: 'hyperliquid' | 'bybit' = 'hyperliquid',
): ProjectionCheckpoint {
  return {
    schema_version: 26,
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
    entry_cancellations: 0,
    active_entry_cancellations: 0,
    account_controls: 0,
    active_account_controls: 0,
    protection_amendments: 0,
    active_protection_amendments: 0,
    orders: 0,
    active_orders: 0,
    positions: 0,
    executions: 0,
    unmatched_executions: 0,
    unresolved_legacy_entities: 0,
    unresolved_external_orders: 0,
    system_external_orders: 0,
    unscoped_external_orders: 0,
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

function positionWithOwnedExposure(scopeId: string, remaining: string): PositionProjection {
  return {
    symbol: 'BTC',
    mode: 'one_way',
    status: 'consistent',
    reconciliation_required: false,
    exchange_quantity: { long: remaining, short: '0' },
    owned_quantity: { long: remaining, short: '0' },
    external_quantity: { long: '0', short: '0' },
    deficit_quantity: { long: '0', short: '0' },
    latest_exchange_revision: 1,
    latest_long_exchange_revision: 1,
    latest_short_exchange_revision: null,
    latest_external_flatten: null,
    owned_exposure: {
      [scopeId]: {
        scope_id: scopeId,
        side: 'long',
        opened_quantity: remaining,
        reduced_quantity: '0',
        remaining_quantity: remaining,
      },
    },
    unallocated_fills: {},
  }
}

function amendmentCommand(
  id: string,
  acceptedAt: number,
  lifecycle: CommandLifecycle,
): CommandProjection {
  return {
    command_id: id,
    accepted_at: acceptedAt,
    accepted: {
      kind: 'amend_protection',
      parameters: {
        protection_id: 'native-protection',
        expected_plan_revision: 1,
      },
    },
    root: { kind: 'protection_amendment', id: 'protection-amendment' },
    operation_ids: ['amend-operation'],
    lifecycle,
    failure_reason: null,
  }
}

function order(id: string): OrderProjection {
  return { order_id: id } as OrderProjection
}

function nativeProtection(
  status: NativeProtectionProjection['status'],
  planRevision: number,
  coveredQuantity: string,
): NativeProtectionProjection {
  const protectionId = 'native-protection'
  const childId = 'native-stop'
  return {
    protection_id: protectionId,
    scope_id: 'native-scope',
    symbol: 'BTC',
    position_side: 'long',
    scope_revision: 1,
    plan_revision: planRevision,
    plan: {
      protection_id: protectionId,
      children: [
        {
          child_id: childId,
          client_order_id: 'trad-native-stop',
          protection_kind: 'stop_loss',
          trigger_price: '62000',
          trigger_source: 'mark_price',
          execution: { kind: 'market' },
          allocation: { kind: 'full_remaining' },
        },
      ],
    },
    target_quantity: '0.125',
    covered_quantity: coveredQuantity,
    status,
    failure_reason: null,
    children: {
      [childId]: {
        child_id: childId,
        target_quantity: '0.125',
        confirmed_quantity: coveredQuantity,
        cumulative_filled_quantity: '0',
        remote_order_ids: coveredQuantity === '0' ? [] : ['remote-stop'],
        pending_operation_id: status === 'installing' ? 'install-operation' : null,
        failure_reason: null,
      },
    },
  }
}

function accountControl(
  lifecycle: AccountControlProjection['lifecycle'],
  lastReason: string | null,
): AccountControlProjection {
  return {
    control_id: 'leverage-control',
    command_id: 'configure-leverage',
    operation_id: 'leverage-operation',
    request: { kind: 'set_leverage', symbol: 'BTC', leverage: 5, margin_mode: 'cross' },
    lifecycle,
    last_reason: lastReason,
  }
}

function protectionAmendment(
  lifecycle: ProtectionAmendmentProjection['lifecycle'],
  completedSteps: number,
): ProtectionAmendmentProjection {
  const plan = nativeProtection('tracking', 1, '0.125').plan
  return {
    amendment_id: 'protection-amendment',
    command_id: 'amend-command',
    protection_id: plan.protection_id,
    expected_plan_revision: 1,
    prior_plan: plan,
    desired_plan: plan,
    steps: [
      {
        kind: 'modify',
        prior: plan.children[0]!,
        desired: plan.children[0]!,
        operation_id: 'amend-operation',
      },
    ],
    completed_steps: completedSteps,
    active_operation_id: lifecycle === 'applying' ? 'amend-operation' : null,
    lifecycle,
    last_reason: null,
    created_at: 20,
  }
}

function amendmentRelationship(commandId: string): PresentationRelationship {
  return {
    parent: { kind: 'command', id: commandId },
    child: { kind: 'protection_amendment', id: 'protection-amendment' },
    relationship: 'command_root',
  }
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

function digest(character: string): string {
  return character.repeat(64)
}
