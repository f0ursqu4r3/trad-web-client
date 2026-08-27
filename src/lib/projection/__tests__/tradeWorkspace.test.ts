import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import { activeCloseWorkflowsForTrade, tradeWorkspaceProjection } from '../tradeWorkspace.ts'
import { managedTradeTrailingEntries } from '../tradeWorkspaceCharts.ts'

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

test('reports only the exact active close lineage as the support reference', () => {
  const snapshot = engineProjectionSnapshot()
  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  const base = {
    close_workflow_id: '39000000-0000-4000-8000-000000000001',
    command_id: '39000000-0000-4000-8000-000000000002',
    source_command_ids: [trade.primaryCommand.command_id],
    symbol: 'ETH',
    position_side: 'long' as const,
    requested_reductions: [{ scope_id: trade.scopeId, quantity: '0.002' }],
    close_all: false,
    authoritative_side: false,
    requested_external_quantity: '0',
    submitted_reductions: null,
    submitted_external_quantity: '0',
    requested_quantity: '0.002',
    source_order_ids: [],
    execution: { kind: 'market' as const },
    execution_root: {
      kind: 'order' as const,
      order_id: '39000000-0000-4000-8000-000000000003',
    },
    close_order_id: '39000000-0000-4000-8000-000000000003',
    submission_operation_id: '39000000-0000-4000-8000-000000000004',
    client_order_id: 'exact-close',
    lifecycle: 'running',
    last_reason: null,
    created_at: 30,
  }
  snapshot.close_workflows.push(
    { ...base, command_id: 'old-terminal', lifecycle: 'failed', created_at: 10 },
    {
      ...base,
      command_id: 'other-scope',
      requested_reductions: [{ scope_id: 'scope-other', quantity: '0.002' }],
      created_at: 40,
    },
    base,
  )

  assert.deepEqual(
    activeCloseWorkflowsForTrade(trade, snapshot).map((workflow) => workflow.command_id),
    [base.command_id],
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

test('retains requested risk separately from initial and current stop exposure', () => {
  const snapshot = engineProjectionSnapshot()
  const primary = snapshot.commands.find((row) => row.accepted.kind === 'place_order')
  assert.ok(primary)
  primary.planning = {
    sizing_mode: 'risk_at_stop',
    requested_risk_budget: '1',
    decision_price: '2000',
    decision_price_source: 'best_ask',
    market_observed_at_ms: 10,
    initial_stop_price: '1800',
    raw_base_quantity: '0.005',
    normalized_base_quantity: '0.00420001',
    normalized_quote_notional: '8.4',
    quantity_step: '0.00000001',
    minimum_order_quantity: '0.00000001',
    minimum_order_notional: '5',
  }

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')

  assert.equal(trade?.plannedRisk, '1')
  assert.equal(trade?.initialPlannedLoss, '0.840002')
  assert.equal(trade?.currentStopExposure, '0.4985411862859983')
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

test('presents exchange confirmation as progress instead of reconciliation attention', () => {
  const snapshot = engineProjectionSnapshot()
  const eth = snapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(eth)
  eth.reconciliation_required = true
  eth.status = 'awaiting_exchange_confirmation'

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')

  assert.equal(trade?.lifecycle, 'active')
  assert.equal(trade?.attentionReason, null)
})

test('keeps taken-over and closed scopes as explicit lifecycle states', () => {
  const takenOverSnapshot = engineProjectionSnapshot()
  const takenOver = takenOverSnapshot.positions.find((position) => position.symbol === 'ETH')
  assert.ok(takenOver)
  const exposure = takenOver.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.detached = true

  const takenOverWorkspace = tradeWorkspaceProjection(takenOverSnapshot)
  const takenOverTrade = takenOverWorkspace.closedTrades.find((row) => row.symbol === 'ETH')
  assert.equal(takenOverTrade?.lifecycle, 'taken_over')
  assert.equal(
    takenOverWorkspace.activeTrades.some((row) => row.symbol === 'ETH'),
    false,
  )

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

test('classifies one-way managed closes by workflow identity instead of reduce-only', () => {
  const snapshot = engineProjectionSnapshot()
  const entry = snapshot.orders.find((row) => row.current_request.symbol === 'ETH')
  const primary = snapshot.commands.find((row) => row.accepted.kind === 'place_order')
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  assert.ok(entry)
  assert.ok(primary)
  assert.ok(position)
  const closeOrderId = '39000000-0000-4000-8000-000000000001'
  const closeCommandId = '39000000-0000-4000-8000-000000000002'
  snapshot.orders.push({
    ...structuredClone(entry),
    order_id: closeOrderId,
    command_id: closeCommandId,
    current_request: {
      ...entry.current_request,
      side: 'sell',
      reduce_only: false,
    },
    target_quantity: '0.00420001',
    filled_quantity: '0.00420001',
    remaining_quantity: '0',
    terminal: true,
  })
  snapshot.commands.push({
    ...structuredClone(primary),
    command_id: closeCommandId,
    accepted: {
      ...primary.accepted,
      kind: 'close_exposure',
      parameters: {},
    },
    lifecycle: 'failed',
    failure_reason: 'an earlier close attempt expired',
  })
  snapshot.close_workflows.push({
    close_workflow_id: '39000000-0000-4000-8000-000000000003',
    command_id: closeCommandId,
    source_command_ids: [primary.command_id],
    symbol: 'ETH',
    position_side: 'long',
    requested_reductions: [{ scope_id: 'scope-filled', quantity: '0.00420001' }],
    close_all: true,
    authoritative_side: false,
    requested_external_quantity: '0',
    submitted_reductions: [{ scope_id: 'scope-filled', quantity: '0.00420001' }],
    submitted_external_quantity: '0',
    requested_quantity: '0.00420001',
    source_order_ids: [entry.order_id],
    execution: { kind: 'market' },
    execution_root: { kind: 'order', order_id: closeOrderId },
    close_order_id: closeOrderId,
    submission_operation_id: '39000000-0000-4000-8000-000000000004',
    client_order_id: 'managed-close',
    lifecycle: 'failed',
    last_reason: 'an earlier close attempt expired',
    created_at: primary.accepted_at + 10_000,
  })
  const entryFill = snapshot.executions.find((row) => row.fill.symbol === 'ETH')
  assert.ok(entryFill)
  snapshot.executions.push({
    ...structuredClone(entryFill),
    event_id: 'scope-close-fill',
    fill: {
      ...entryFill.fill,
      event_id: 'scope-close-fill',
      execution_id: 'scope-close-execution',
      client_order_id: 'managed-close',
      remote_order_id: 'managed-close-remote',
      side: 'sell',
      price: '2000',
      quantity: '0.002',
      fee: { asset: 'USDC', amount: '0.1' },
      builder_fee: { asset: 'USDC', amount: '0.04' },
      realized_pnl: { asset: 'USDC', amount: '999' },
    },
    order: { order_id: closeOrderId, generation: 1 },
  })
  const exposure = position.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.reduced_quantity = exposure.opened_quantity
  exposure.remaining_quantity = '0'
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'

  const workspace = tradeWorkspaceProjection(snapshot)
  const trade = workspace.closedTrades.find((row) => row.symbol === 'ETH')

  assert.ok(trade)
  assert.equal(trade.entryOrders.length, 1)
  assert.equal(trade.closeOrders.length, 1)
  assert.equal(trade.requestedQuantity, '0.00420001')
  assert.equal(trade.filledQuantity, '0.00420001')
  assert.equal(trade.attentionReason, 'an earlier close attempt expired')
  assert.equal(trade.realizedPnl.get('USDC'), '0.16235000034')
  assert.equal(trade.venueRealizedPnl.get('USDC'), '999')
})

test('closes a zero-fill failed entry despite inert protection placeholders', () => {
  const snapshot = engineProjectionSnapshot()
  const command = snapshot.commands.find((row) => row.accepted.kind === 'place_order')
  const entry = snapshot.orders.find((row) => row.current_request.symbol === 'ETH')
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  assert.ok(command)
  assert.ok(entry)
  assert.ok(position)

  command.lifecycle = 'failed'
  command.failure_reason = 'queued market open expired before exchange dispatch'
  entry.filled_quantity = '0'
  entry.remaining_quantity = entry.target_quantity
  entry.terminal = true
  entry.failure_reason = command.failure_reason
  delete position.owned_exposure['scope-filled']
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'
  snapshot.orders.push({
    ...structuredClone(entry),
    order_id: '39000000-0000-4000-8000-000000000010',
    target_quantity: '0',
    remaining_quantity: '0',
    terminal: false,
    failure_reason: null,
  })

  const workspace = tradeWorkspaceProjection(snapshot)
  const trade = workspace.closedTrades.find((row) => row.symbol === 'ETH')

  assert.ok(trade)
  assert.equal(trade.lifecycle, 'closed')
  assert.equal(trade.attentionReason, 'queued market open expired before exchange dispatch')
  assert.equal(
    workspace.activeTrades.some((row) => row.symbol === 'ETH'),
    false,
  )
})

test('selects the active strategy chart before older terminal chart sources', () => {
  const snapshot = engineProjectionSnapshot()
  const workspace = tradeWorkspaceProjection(snapshot)
  const trade = workspace.activeTrades.find((row) => row.symbol === 'SOL')
  const active = snapshot.trailing_entries[0]
  assert.ok(trade)
  assert.ok(active)
  snapshot.trailing_entries.push({
    ...active,
    trailing_entry_id: '35000000-0000-4000-8000-000000000099',
    lifecycle: 'succeeded',
    phase: 'completed',
    created_at: active.created_at - 1_000,
  })

  assert.deepEqual(
    managedTradeTrailingEntries(trade, snapshot).map((entry) => entry.trailing_entry_id),
    [active.trailing_entry_id, '35000000-0000-4000-8000-000000000099'],
  )
})
