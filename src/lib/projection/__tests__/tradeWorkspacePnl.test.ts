import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import { tradeWorkspaceProjection } from '../tradeWorkspace.ts'

test('a partial short close uses its own entry basis and excludes mixed external reductions', () => {
  const snapshot = engineProjectionSnapshot()
  const entry = snapshot.orders.find((row) => row.current_request.symbol === 'ETH')
  const entryFill = snapshot.executions.find((row) => row.fill.symbol === 'ETH')
  const primary = snapshot.commands.find((row) => row.accepted.kind === 'place_order')
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  assert.ok(entry)
  assert.ok(entryFill)
  assert.ok(primary)
  assert.ok(position)
  const exposure = position.owned_exposure['scope-filled']
  assert.ok(exposure)

  entry.current_request.side = 'sell'
  entry.current_request.position_side = 'short'
  entry.accepted_request.side = 'sell'
  entry.accepted_request.position_side = 'short'
  for (const fill of snapshot.executions.filter((row) => row.fill.symbol === 'ETH')) {
    fill.fill.side = 'sell'
    fill.fill.position_side = 'short'
  }
  exposure.side = 'short'
  exposure.reduced_quantity = '0.002'
  exposure.remaining_quantity = '0.00220001'
  position.exchange_quantity.long = '0'
  position.exchange_quantity.short = '0.00220001'
  position.owned_quantity.long = '0'
  position.owned_quantity.short = '0.00220001'

  const closeCommandId = '39000000-0000-4000-8000-000000000102'
  const closeOrderId = '39000000-0000-4000-8000-000000000101'
  snapshot.close_workflows.push({
    close_workflow_id: '39000000-0000-4000-8000-000000000103',
    command_id: closeCommandId,
    source_command_ids: [primary.command_id],
    symbol: 'ETH',
    position_side: 'short',
    requested_reductions: [{ scope_id: 'scope-filled', quantity: '0.002' }],
    close_all: false,
    authoritative_side: false,
    requested_external_quantity: '0',
    submitted_reductions: [{ scope_id: 'scope-filled', quantity: '0.002' }],
    submitted_external_quantity: '0',
    requested_quantity: '0.002',
    source_order_ids: [entry.order_id],
    execution: { kind: 'market' },
    execution_root: { kind: 'order', order_id: closeOrderId },
    close_order_id: closeOrderId,
    submission_operation_id: '39000000-0000-4000-8000-000000000104',
    client_order_id: 'partial-short-close',
    lifecycle: 'succeeded',
    last_reason: null,
    created_at: primary.accepted_at + 1000,
  })
  snapshot.orders.push({
    ...structuredClone(entry),
    order_id: closeOrderId,
    command_id: closeCommandId,
    current_request: { ...entry.current_request, side: 'buy', reduce_only: true },
    target_quantity: '0.002',
    filled_quantity: '0.002',
    remaining_quantity: '0',
    terminal: true,
  })
  snapshot.executions.push({
    ...structuredClone(entryFill),
    event_id: 'partial-short-close-fill',
    fill: {
      ...entryFill.fill,
      event_id: 'partial-short-close-fill',
      execution_id: 'partial-short-close-execution',
      client_order_id: 'partial-short-close',
      remote_order_id: 'partial-short-close-remote',
      side: 'buy',
      price: '1800',
      quantity: '0.002',
      fee: { asset: 'USDC', amount: '0.1' },
      builder_fee: { asset: 'USDC', amount: '0.04' },
      realized_pnl: { asset: 'USDC', amount: '999' },
    },
    order: { order_id: closeOrderId, generation: 1 },
  })

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  assert.equal(trade.pnlEvidenceComplete, true)
  assert.equal(trade.realizedPnl.get('USDC'), '0.23764999966')
  assert.notEqual(trade.realizedPnl.get('USDC'), trade.venueRealizedPnl.get('USDC'))

  snapshot.close_workflows[0]!.requested_external_quantity = '0.001'
  const mixed = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')
  assert.ok(mixed)
  assert.equal(mixed.pnlEvidenceComplete, false)
  assert.equal(mixed.netAfterFees.size, 0)
})
