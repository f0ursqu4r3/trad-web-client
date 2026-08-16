import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import { terminalCommandTree } from '../terminalPresentation.ts'

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
})
