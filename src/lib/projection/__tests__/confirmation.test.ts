import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import type { BrowserAccountSnapshot } from '../../gateway/index.ts'
import { terminalCommandTree, type TerminalTreeNode } from '../terminalPresentation.ts'
import { tradeProgressMessage } from '../tradeProgress.ts'
import { tradeWorkspaceProjection } from '../tradeWorkspace.ts'

// 2026-10-29: a Chase whose reprice cancel raced a fill showed the red
// Reconcile state for the 25-70 ms its exact cancel-outcome query took. The
// backend now marks those rows confirming_cancel and keeps the command
// running; the browser shows them as confirming.

function chaseRace(confirming: boolean): {
  snapshot: BrowserAccountSnapshot
  commandId: string
  symbol: string
} {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((row) => row.accepted.kind === 'place_chase')!
  const chase = snapshot.chases.find((row) => row.command_id === command.command_id)!
  const order = snapshot.orders.find((row) => row.order_id === chase.order_id)!
  order.lifecycle = 'reconciliation_required'
  order.terminal = false
  order.reconciliation_required = true
  chase.lifecycle = 'reconciliation_required'
  chase.last_reason = 'the venue has not confirmed whether the Chase order was canceled'
  if (confirming) {
    order.confirming_cancel = true
    chase.confirming_cancel = true
    command.lifecycle = 'running'
    command.failure_reason = null
  } else {
    command.lifecycle = 'reconciliation_required'
    command.failure_reason = chase.last_reason
  }
  return { snapshot, commandId: command.command_id, symbol: order.current_request.symbol }
}

test('a cancel being confirmed shows as confirming, not as reconciliation', () => {
  const { snapshot, commandId, symbol } = chaseRace(true)

  const tree = terminalCommandTree(snapshot, snapshot, commandId)!
  const chase = find(tree, 'chase')!
  assert.equal(chase.status, 'Confirming')
  assert.equal(chase.tone, 'info')
  const order = find(tree, 'order')!
  assert.equal(order.status, 'Confirming')
  const badges = order.badges.map((badge) => badge.label)
  assert.ok(badges.includes('Confirming Cancel'), badges.join(', '))
  assert.ok(!badges.includes('Reconcile'))

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find(
    (row) => row.primaryCommand.command_id === commandId,
  )!
  assert.equal(trade.symbol, symbol)
  assert.equal(trade.attentionReason, null)
  assert.notEqual(trade.lifecycle, 'attention')
  assert.equal(
    tradeProgressMessage(trade, snapshot.chases.find((row) => row.command_id === commandId)!),
    'Confirming a Chase cancel with the exchange',
  )
})

test('a cancel the venue never confirmed still shows reconciliation', () => {
  const { snapshot, commandId } = chaseRace(false)

  const tree = terminalCommandTree(snapshot, snapshot, commandId)!
  const chase = find(tree, 'chase')!
  assert.equal(chase.status, 'Failed')
  assert.equal(chase.tone, 'error')
  assert.ok(find(tree, 'order')!.badges.some((badge) => badge.label === 'Reconcile'))

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find(
    (row) => row.primaryCommand.command_id === commandId,
  )!
  assert.equal(trade.lifecycle, 'attention')
  assert.equal(
    trade.attentionReason,
    'the venue has not confirmed whether the Chase order was canceled',
  )
})

test('a protection flagged only while its resize after a fill lands shows as resizing', () => {
  const snapshot = engineProjectionSnapshot()
  const protection = snapshot.native_protections.find((row) => row.symbol === 'ETH')!
  protection.status = 'reconciliation_required'
  protection.failure_reason = 'active native protection exceeds its exact owned target quantity'
  protection.resizing_after_fill = true
  protection.rearm = { available: false, refused_reason: 'a protection write is in flight' }

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')!
  assert.equal(trade.attentionReason, null)
  assert.equal(trade.lifecycle, 'active')
  assert.equal(tradeProgressMessage(trade, null), 'Resizing protection to the latest fill')

  protection.resizing_after_fill = false
  const flagged = tradeWorkspaceProjection(snapshot).activeTrades.find(
    (row) => row.symbol === 'ETH',
  )!
  assert.equal(flagged.lifecycle, 'attention')
  assert.equal(flagged.attentionReason, protection.failure_reason)
})

function find(root: TerminalTreeNode, kind: string): TerminalTreeNode | null {
  if (root.kind === kind) return root
  for (const child of root.children) {
    const match = find(child, kind)
    if (match !== null) return match
  }
  return null
}
