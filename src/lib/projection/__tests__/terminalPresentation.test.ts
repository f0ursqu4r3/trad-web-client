import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import {
  terminalCommandTree,
  terminalNodeCommandId,
  terminalNodeDeviceId,
  type TerminalTreeNode,
} from '../terminalPresentation.ts'

test('flat native protection renders filled and retired children as terminal', () => {
  const snapshot = engineProjectionSnapshot()
  const protection = snapshot.native_protections[0]!
  const command = snapshot.commands.find((candidate) => candidate.accepted.kind === 'place_order')!
  const [takeProfit, stopLoss] = protection.plan.children

  protection.status = 'flat'
  protection.target_quantity = '0'
  protection.covered_quantity = '0'
  protection.children[takeProfit!.child_id]!.target_quantity = '0'
  protection.children[takeProfit!.child_id]!.confirmed_quantity = '0'
  protection.children[stopLoss!.child_id]!.target_quantity = '0'
  protection.children[stopLoss!.child_id]!.confirmed_quantity = '0'
  protection.children[stopLoss!.child_id]!.cumulative_filled_quantity = '0.00420001'

  const tree = terminalCommandTree(snapshot, snapshot, command.command_id)
  const nativeProtection = tree?.children.find((child) => child.kind === 'native_protection')

  assert.equal(nativeProtection?.status, 'Completed')
  assert.equal(nativeProtection?.children[0]?.status, 'Canceled')
  assert.equal(nativeProtection?.children[1]?.status, 'Completed')
})

test('order preparation blocks are named and visible in the terminal tree', () => {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((candidate) => candidate.accepted.kind === 'place_order')!
  const order = snapshot.orders.find((candidate) => candidate.command_id === command.command_id)!
  order.blocking_reason = 'command planning failed: instrument rules is stale'

  const tree = terminalCommandTree(snapshot, snapshot, command.command_id)

  assert.equal(tree?.status, 'Blocked')
  assert.equal(tree?.blockedReason, order.blocking_reason)
  assert.deepEqual(
    tree?.badges.slice(0, 2).map((badge) => badge.label),
    ['Exchange Order', 'Opening Execution'],
  )
  assert.equal(terminalNodeDeviceId(tree!), order.order_id)
  assert.equal(terminalNodeCommandId(tree!, snapshot), command.command_id)
})

test('typed physical reconciliation remains visible as waiting on its exact outcome', () => {
  const snapshot = engineProjectionSnapshot()
  const chase = snapshot.commands.find((candidate) => candidate.accepted.kind === 'place_chase')!
  const order = snapshot.orders.find((candidate) => candidate.command_id === chase.command_id)!
  order.generations['2']!.lifecycle = {
    awaiting_cancel_outcome: { query: '50000000-0000-4000-8000-000000000099' },
  }

  const tree = terminalCommandTree(snapshot, snapshot, chase.command_id)!
  const physical = find(tree, 'order_generation', 'Order Generation 2')

  assert.equal(physical?.status, 'Waiting')
  assert.equal(physical?.tone, 'dim')
})

function find(root: TerminalTreeNode, kind: string, label: string): TerminalTreeNode | null {
  if (root.kind === kind && root.label === label) return root
  for (const child of root.children) {
    const match = find(child, kind, label)
    if (match !== null) return match
  }
  return null
}

test('a Chase ended by expiry or boundary is terminal and shows a pending rest at market', () => {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((candidate) => candidate.accepted.kind === 'place_chase')!
  const chase = snapshot.chases.find((candidate) => candidate.command_id === command.command_id)!
  const chaseNode = (): TerminalTreeNode | undefined =>
    findNode(terminalCommandTree(snapshot, snapshot, command.command_id), 'chase')

  chase.lifecycle = 'expired'
  chase.market_fill_pending = true
  assert.equal(chaseNode()?.status, 'Expired')
  assert.ok(chaseNode()?.badges.some((badge) => badge.label === 'Rest At Market Pending'))

  chase.lifecycle = 'boundary_reached'
  chase.market_fill_pending = false
  assert.equal(chaseNode()?.status, 'Boundary reached')
  assert.ok(!chaseNode()?.badges.some((badge) => badge.label === 'Rest At Market Pending'))
})

function findNode(
  node: TerminalTreeNode | null | undefined,
  kind: string,
): TerminalTreeNode | undefined {
  if (node === null || node === undefined) return undefined
  if (node.kind === kind) return node
  for (const child of node.children) {
    const found = findNode(child, kind)
    if (found !== undefined) return found
  }
  return undefined
}
