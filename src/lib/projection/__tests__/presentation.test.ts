import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  ChaseProjection,
  CommandProjection,
  OrderProjection,
  PresentationRelationship,
  ProjectionGraph,
} from '../../gateway/index.ts'
import {
  commandKindLabel,
  commandSymbol,
  commandSymbolIndex,
  commandTree,
  entityLabel,
  projectionEntities,
} from '../presentation.ts'

test('a command tree follows typed relationships instead of inferred ownership', () => {
  const graph = chaseGraph()
  const tree = commandTree(graph, 'command-chase')

  assert.notEqual(tree, null)
  assert.equal(tree?.entity.kind, 'command')
  assert.equal(tree?.children[0]?.entity.kind, 'chase')
  assert.equal(tree?.children[0]?.relationship, 'command_root')
  assert.equal(tree?.children[0]?.children[0]?.entity.kind, 'order')
  assert.equal(tree?.children[0]?.children[0]?.relationship, 'chase_order')
  assert.equal(commandSymbol(graph.commands[0] as CommandProjection, graph), 'BTC')
  assert.equal(commandSymbolIndex(graph).get('command-chase'), 'BTC')
})

test('a malformed relationship cycle terminates at the repeated ancestor', () => {
  const graph = chaseGraph()
  graph.relationships.push({
    parent: { kind: 'order', id: 'order-chase' },
    child: { kind: 'chase', id: 'chase-1' },
    relationship: 'execution_child',
  })

  const tree = commandTree(graph, 'command-chase')
  const order = tree?.children[0]?.children[0]

  assert.notEqual(order, undefined)
  assert.deepEqual(order?.children, [])
  assert.equal(commandSymbolIndex(graph).get('command-chase'), 'BTC')
})

test('presentation labels preserve strategy and execution distinctions', () => {
  const graph = chaseGraph()
  const entities = projectionEntities(graph)
  const chase = entities.get('chase:chase-1')
  const order = entities.get('order:order-chase')

  assert.notEqual(chase, undefined)
  assert.notEqual(order, undefined)
  assert.equal(entityLabel(chase!), 'Chase')
  assert.equal(entityLabel(order!), 'Limit Order')
  assert.equal(commandKindLabel('close_exposure'), 'Close Exposure')
  assert.equal(commandKindLabel('future_strategy'), 'Future Strategy')
})

function chaseGraph(): ProjectionGraph {
  const command: CommandProjection = {
    command_id: 'command-chase',
    accepted_at: 1_786_200_000_000,
    accepted: { kind: 'place_chase', parameters: {} },
    root: { kind: 'chase', id: 'chase-1' },
    operation_ids: [],
    lifecycle: 'running',
    failure_reason: null,
  }
  const chase = {
    chase_id: 'chase-1',
    command_id: command.command_id,
    order_id: 'order-chase',
    plan: { symbol: 'BTC', position_side: 'long', quantity: '0.125' },
    lifecycle: 'working',
  } as ChaseProjection
  const order = {
    order_id: 'order-chase',
    command_id: command.command_id,
    current_request: {
      symbol: 'BTC',
      side: 'buy',
      position_side: 'long',
      quantity: '0.125',
      execution: { kind: 'limit', price: '64231.125' },
      reduce_only: false,
    },
  } as OrderProjection
  const relationships: PresentationRelationship[] = [
    {
      parent: { kind: 'command', id: command.command_id },
      child: { kind: 'chase', id: chase.chase_id },
      relationship: 'command_root',
    },
    {
      parent: { kind: 'chase', id: chase.chase_id },
      child: { kind: 'order', id: order.order_id },
      relationship: 'chase_order',
    },
  ]
  return {
    commands: [command],
    execution_groups: [],
    chases: [chase],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [order],
    executions: [],
    relationships,
  }
}
