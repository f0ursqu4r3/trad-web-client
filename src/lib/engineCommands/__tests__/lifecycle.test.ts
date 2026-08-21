import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  CommandProjection,
  ProjectionGraph,
  TrailingEntryProjection,
} from '../../gateway/index.ts'
import { projectionEntities } from '../../projection/presentation.ts'
import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import { lifecycleActions, lifecycleIntent } from '../lifecycle.ts'

test('projected Chase actions target authoritative identities', () => {
  const graph = engineProjectionSnapshot()
  const command = graph.commands.find((row) => row.accepted.kind === 'place_chase')!
  const entity = projectionEntities(graph).get(`command:${command.command_id}`)!
  const actions = lifecycleActions(entity, graph, graph.positions)

  assert.deepEqual(
    actions.map((action) => action.kind),
    ['cancel_chase', 'close_exposure', 'take_over_exposure'],
  )
  assert.deepEqual(lifecycleIntent(actions[0]!), {
    kind: 'cancel_chase',
    parameters: { chase_id: graph.chases[0]!.chase_id },
  })
  assert.deepEqual(lifecycleIntent(actions[1]!, { closeMode: 'percent', closePercent: '50' }), {
    kind: 'close_exposure',
    parameters: {
      source_command_id: command.command_id,
      quantity: { kind: 'percent', percent: '50' },
      execution: { kind: 'market' },
    },
  })
  assert.deepEqual(lifecycleIntent(actions[2]!), {
    kind: 'take_over_exposure',
    parameters: { source_command_id: command.command_id },
  })
  assert.deepEqual(lifecycleIntent(actions[1]!, { closeMode: 'base', closeQuantity: '0.01000' }), {
    kind: 'close_exposure',
    parameters: {
      source_command_id: command.command_id,
      quantity: { kind: 'base', quantity: '0.01000' },
      execution: { kind: 'market' },
    },
  })

  assert.deepEqual(
    lifecycleIntent(actions[1]!, {
      closeExecutionMode: 'limit',
      closeLimitPrice: '64250.5',
      closeLimitTimeInForce: 'post_only',
    }),
    {
      kind: 'close_exposure',
      parameters: {
        source_command_id: command.command_id,
        quantity: { kind: 'full' },
        execution: {
          kind: 'limit',
          price: '64250.5',
          time_in_force: 'post_only',
        },
      },
    },
  )

  assert.deepEqual(
    lifecycleIntent(actions[1]!, {
      closeExecutionMode: 'chase',
      closeChaseBoundaryEnabled: true,
      closeChaseBoundaryMode: 'basis_points',
      closeChaseBoundaryValue: '20',
      closeChaseUntilCanceled: false,
      closeChaseExpiryMinutes: '5',
    }),
    {
      kind: 'close_exposure',
      parameters: {
        source_command_id: command.command_id,
        quantity: { kind: 'full' },
        execution: {
          kind: 'chase',
          adverse_boundary: { kind: 'basis_points', value: '20' },
          expires_after_ms: 300_000,
        },
      },
    },
  )
})

test('selecting a Chase child still controls the owning Chase', () => {
  const graph = engineProjectionSnapshot()
  const chaseOrder = graph.orders.find((row) => row.command_id === graph.chases[0]!.command_id)!
  const entity = projectionEntities(graph).get(`order:${chaseOrder.order_id}`)!
  const actions = lifecycleActions(entity, graph, graph.positions)

  assert.deepEqual(
    actions.map((action) => action.kind),
    ['cancel_chase', 'close_exposure', 'take_over_exposure'],
  )
})

test('Trailing Entry immediate actions carry projected optimistic concurrency state', () => {
  const graph = trailingEntryGraph()
  const entry = projectionEntities(graph).get('trailing_entry:te-1')!
  const positions = [
    {
      ...engineProjectionSnapshot().positions[0]!,
      owned_exposure: {
        'scope-te': {
          scope_id: 'scope-te',
          side: 'long' as const,
          opened_quantity: '0.1',
          reduced_quantity: '0',
          remaining_quantity: '0.1',
        },
      },
    },
  ]
  const actions = lifecycleActions(entry, graph, positions)
  assert.deepEqual(
    actions.map((action) => action.kind),
    [
      'amend_trailing_entry',
      'activate_trailing_entry',
      'enter_trailing_entry',
      'cancel_trailing_entry',
      'close_trailing_entry',
      'take_over_exposure',
    ],
  )

  const activate = actions.find((action) => action.kind === 'activate_trailing_entry')!
  assert.deepEqual(lifecycleIntent(activate), {
    kind: 'activate_trailing_entry',
    parameters: {
      trailing_entry_id: 'te-1',
      expected: { state_revision: 17, phase: 'waiting_for_activation', lifecycle: 'running' },
    },
  })

  const amend = actions.find((action) => action.kind === 'amend_trailing_entry')!
  assert.deepEqual(
    lifecycleIntent(amend, {
      trailingEntry: {
        activationPrice: '63100',
        jumpBasisPoints: '12.5',
        stopLossPrice: '62100',
        takeProfitMode: 'clear',
        takeProfitPrice: '',
        riskAmount: '125',
      },
    }),
    {
      kind: 'amend_trailing_entry',
      parameters: {
        trailing_entry_id: 'te-1',
        expected: { state_revision: 17, phase: 'waiting_for_activation', lifecycle: 'running' },
        activation_price: '63100',
        jump_basis_points: '12.5',
        stop_loss_price: '62100',
        take_profit: { kind: 'clear' },
        risk_amount: '125',
      },
    },
  )
})

test('standalone live limits expose cancel, modify, and source-owned close', () => {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((row) => row.accepted.kind === 'place_order')!
  const order = snapshot.orders.find((row) => row.command_id === command.command_id)!
  order.terminal = false
  order.lifecycle = 'working'
  order.current_request.execution = {
    kind: 'limit',
    price: '1920.25',
    time_in_force: 'post_only',
  }
  const entity = projectionEntities(snapshot).get(`order:${order.order_id}`)!
  const actions = lifecycleActions(entity, snapshot, snapshot.positions)
  assert.deepEqual(
    actions.map((action) => action.kind),
    ['cancel_order', 'modify_order', 'close_exposure', 'take_over_exposure'],
  )

  const modify = actions.find((action) => action.kind === 'modify_order')!
  assert.deepEqual(lifecycleIntent(modify, { targetPrice: '1921.125', targetQuantity: '0.005' }), {
    kind: 'modify_order',
    parameters: {
      order_id: order.order_id,
      target_price: '1921.125',
      target_base_quantity: '0.005',
    },
  })
})

test('a selected close-workflow child remains directly cancelable', () => {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((row) => row.accepted.kind === 'place_order')!
  const order = snapshot.orders.find((row) => row.command_id === command.command_id)!
  command.accepted = { kind: 'close_exposure', parameters: {} }
  command.root = { kind: 'close_workflow', id: 'close-workflow-1' }
  order.terminal = false
  order.lifecycle = 'working'
  order.current_request.execution = {
    kind: 'limit',
    price: '1920.25',
    time_in_force: 'post_only',
  }

  const entity = projectionEntities(snapshot).get(`order:${order.order_id}`)!
  const actions = lifecycleActions(entity, snapshot, snapshot.positions)

  assert.deepEqual(
    actions.map((action) => action.kind),
    ['cancel_order', 'modify_order'],
  )
})

function trailingEntryGraph(): ProjectionGraph {
  const command: CommandProjection = {
    command_id: 'command-1',
    accepted_at: 1,
    accepted: {
      kind: 'place_trailing_entry',
      parameters: { plan: { execution: { exposure_scope_id: 'scope-te' } } },
    },
    root: { kind: 'trailing_entry', id: 'te-1' },
    operation_ids: [],
    lifecycle: 'running',
    failure_reason: null,
  }
  const entry: TrailingEntryProjection = {
    trailing_entry_id: 'te-1',
    command_id: 'command-1',
    state_revision: 17,
    mutation_command_ids: [],
    plan: {
      symbol: 'BTC',
      activation_price: '63000',
      jump_threshold: '10',
      stop_loss: '62000',
      take_profit: '65000',
      risk_amount: '100',
    },
    phase: 'waiting_for_activation',
    lifecycle: 'running',
    market_generation: 1,
    market_stale: false,
    cursor: null,
    latest_trade: null,
    latest_trade_received_at: null,
    point_count: 0,
    actual_activation_price: null,
    activation_point_index: null,
    peak: null,
    peak_point_index: null,
    trigger: { execution: {} },
    continuations: [],
    entry_cancel_requested: false,
    close_workflow_id: null,
    last_reason: null,
    created_at: 1,
  }
  return {
    commands: [command],
    execution_groups: [],
    chases: [],
    trailing_entries: [entry],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [],
    executions: [],
    relationships: [
      {
        parent: { kind: 'command', id: 'command-1' },
        child: { kind: 'trailing_entry', id: 'te-1' },
        relationship: 'command_root',
      },
    ],
  }
}
