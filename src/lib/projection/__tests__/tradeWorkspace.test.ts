import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import { tradeWorkspaceProjection } from '../tradeWorkspace.ts'

test('derives pending and active trades from exposure scope identity', () => {
  const workspace = tradeWorkspaceProjection(engineProjectionSnapshot())

  assert.deepEqual(
    workspace.activeTrades.map((trade) => [trade.symbol, trade.lifecycle]),
    [
      ['BTC', 'active'],
      ['SOL', 'entering'],
      ['ETH', 'active'],
    ],
  )
  assert.equal(workspace.closedTrades.length, 0)
  assert.equal(
    workspace.activeTrades.find((trade) => trade.symbol === 'ETH')?.scopeId,
    'scope-filled',
  )
})

test('correlates positions, orders, executions, and protection without symbol guessing', () => {
  const workspace = tradeWorkspaceProjection(engineProjectionSnapshot())
  const eth = workspace.activeTrades.find((trade) => trade.symbol === 'ETH')
  const btc = workspace.activeTrades.find((trade) => trade.symbol === 'BTC')

  assert.equal(eth?.filledQuantity, '0.00420001')
  assert.equal(eth?.remainingQuantity, '0.00420001')
  assert.equal(eth?.averageEntryPrice, '1918.82499983')
  assert.equal(eth?.protection?.status, 'tracking')
  assert.equal(eth?.executions.length, 2)
  assert.equal(btc?.filledQuantity, '0.025')
  assert.equal(btc?.requestedQuantity, '0.125')

  const ethPosition = workspace.positions.find((row) => row.position.symbol === 'ETH')
  assert.deepEqual(ethPosition?.tradeIds, ['scope:scope-filled'])
})

test('keeps external orders explicitly outside every managed trade', () => {
  const workspace = tradeWorkspaceProjection(engineProjectionSnapshot())
  const external = workspace.openOrders.find((order) => !order.managed)

  assert.equal(external?.symbol, 'ETH')
  assert.equal(external?.tradeId, null)
  assert.equal(external?.purpose, 'External')
})

test('does not adopt outside venue exposure into a managed trade', () => {
  const snapshot = engineProjectionSnapshot()
  const eth = snapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(eth)
  eth.exchange_quantity.long = '1.00420001'
  eth.external_quantity.long = '1'

  const workspace = tradeWorkspaceProjection(snapshot)
  const trade = workspace.activeTrades.find((row) => row.symbol === 'ETH')

  assert.equal(trade?.remainingQuantity, '0.00420001')
  assert.equal(
    workspace.positions.find((row) => row.position.symbol === 'ETH')?.position.external_quantity
      .long,
    '1',
  )
})

test('surfaces reconciliation attention without losing trade identity', () => {
  const snapshot = engineProjectionSnapshot()
  const eth = snapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(eth)
  eth.reconciliation_required = true
  eth.status = 'reconciliation_required'

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')

  assert.equal(trade?.tradeId, 'scope:scope-filled')
  assert.equal(trade?.lifecycle, 'attention')
  assert.equal(trade?.attentionReason, 'Position reconciliation is required.')
})

test('keeps taken-over and closed scopes as explicit lifecycle states', () => {
  const takenOverSnapshot = engineProjectionSnapshot()
  const takenOver = takenOverSnapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(takenOver)
  const exposure = takenOver.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.detached = true

  const takenOverTrade = tradeWorkspaceProjection(takenOverSnapshot).activeTrades.find(
    (row) => row.symbol === 'ETH',
  )
  assert.equal(takenOverTrade?.lifecycle, 'taken_over')

  const closedSnapshot = engineProjectionSnapshot()
  const closed = closedSnapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(closed)
  const closedExposure = closed.owned_exposure['scope-filled']
  assert.ok(closedExposure)
  closedExposure.reduced_quantity = closedExposure.opened_quantity
  closedExposure.remaining_quantity = '0'

  const workspace = tradeWorkspaceProjection(closedSnapshot)
  assert.equal(
    workspace.activeTrades.some((row) => row.symbol === 'ETH'),
    false,
  )
  assert.equal(workspace.closedTrades.find((row) => row.symbol === 'ETH')?.lifecycle, 'closed')
})
