import assert from 'node:assert/strict'
import test from 'node:test'

import type { CommandProjection, PositionProjection, ProjectionGraph } from '../../gateway/index.ts'
import {
  commandPosition,
  defaultProjectionCommandFilters,
  filterProjectionCommands,
} from '../commandFilters.ts'

const OPEN_COMMAND = command('open', 2_000, 'place_order', 'running', 'scope-open')
const CLOSED_COMMAND = command('closed', 1_000, 'place_chase', 'succeeded', 'scope-closed')
const CONTROL_COMMAND = command('control', 3_000, 'configure_account', 'succeeded', null)
const GRAPH: ProjectionGraph = {
  commands: [OPEN_COMMAND, CLOSED_COMMAND, CONTROL_COMMAND],
  execution_groups: [],
  chases: [],
  trailing_entries: [],
  close_workflows: [],
  flatten_workflows: [],
  entry_cancellations: [],
  account_controls: [],
  protection_amendments: [],
  orders: [
    {
      order_id: 'order-open',
      command_id: 'open',
      accepted_request: request('BTC'),
      current_request: request('BTC'),
      lifecycle: 'working',
      terminal: false,
      reconciliation_required: false,
      target_quantity: '1',
      filled_quantity: '1',
      remaining_quantity: '0',
      overfill_quantity: '0',
      active_generation: 0,
      generations: {},
      failure_reason: null,
    },
  ],
  executions: [],
  relationships: [
    {
      parent: { kind: 'command', id: 'open' },
      child: { kind: 'order', id: 'order-open' },
      relationship: 'command_root',
    },
  ],
}
const POSITIONS: PositionProjection[] = [
  position('scope-open', '0.00000001'),
  position('scope-closed', '0.000'),
]

test('projection command filters derive exact open and closed ownership without floats', () => {
  assert.equal(commandPosition(OPEN_COMMAND, POSITIONS), 'open')
  assert.equal(commandPosition(CLOSED_COMMAND, POSITIONS), 'closed')
  assert.equal(commandPosition(CONTROL_COMMAND, POSITIONS), 'not_applicable')

  const filters = defaultProjectionCommandFilters()
  filters.positions = ['open']
  assert.deepEqual(filterProjectionCommands(GRAPH.commands, GRAPH, POSITIONS, filters), [
    OPEN_COMMAND,
  ])
})

test('projection command filters compose lifecycle, kind, symbol, and recent windows', () => {
  const filters = defaultProjectionCommandFilters()
  filters.kinds = ['place_order']
  filters.lifecycles = ['running']
  filters.symbols = ['BTC']
  filters.recent = '12h'
  const now = 2_000 + 12 * 60 * 60 * 1_000
  assert.deepEqual(filterProjectionCommands(GRAPH.commands, GRAPH, POSITIONS, filters, now), [
    OPEN_COMMAND,
  ])
})

function command(
  id: string,
  acceptedAt: number,
  kind: string,
  lifecycle: CommandProjection['lifecycle'],
  scopeId: string | null,
): CommandProjection {
  return {
    command_id: id,
    accepted_at: acceptedAt,
    accepted: {
      kind,
      parameters:
        scopeId === null
          ? {}
          : { plan: { position_intent: { kind: 'open', scope_id: scopeId } } },
    },
    root: kind === 'place_order' ? { kind: 'order', id: 'order-open' } : { kind: 'command', id },
    operation_ids: [],
    lifecycle,
    failure_reason: null,
  }
}

function request(symbol: string) {
  return {
    symbol,
    side: 'buy' as const,
    position_side: 'long' as const,
    quantity: '1',
    execution: { kind: 'market' },
    reduce_only: false,
  }
}

function position(scopeId: string, remaining: string): PositionProjection {
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
    latest_short_exchange_revision: 1,
    owned_exposure: {
      [scopeId]: {
        scope_id: scopeId,
        side: 'long',
        opened_quantity: '1',
        reduced_quantity: remaining === '0.000' ? '1' : '0',
        remaining_quantity: remaining,
      },
    },
    unallocated_fills: {},
  }
}
