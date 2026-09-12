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
    fee_risk: {
      planned_price_loss: '0.840002',
      expected_entry_fee: '0.00462',
      expected_stop_exit_fee: '0.004158',
      total_planned_loss: '0.84878',
      expected_entry_fee_rate: '0.00055',
      expected_stop_exit_fee_rate: '0.00055',
      policy_source: 'hyperliquid',
      policy_version: 4,
      all_in_target_tenths_bps: 55,
      evidence_observed_at_ms: 1,
      evidence_valid_until_ms: 2,
    },
  }

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')

  assert.equal(trade?.plannedRisk, '1')
  assert.equal(trade?.initialPlannedLoss, '0.84878')
  assert.equal(trade?.currentStopExposure, '0.4985411862859983')
})

test('surfaces authoritative Chase all-in risk accounting and fee provenance', () => {
  const snapshot = engineProjectionSnapshot()
  const chase = snapshot.chases[0]
  assert.ok(chase)
  chase.price_risk = {
    revision: 8,
    stop_price: '81350',
    candidate_price: '80662',
    calculation_cap: '4.05844',
    filled_quantity: '3.3',
    filled_price_risk: '2247.8930736933396',
    fee_risk: {
      consumed_entry_fees: '145.2',
      expected_entry_fees: '140.1',
      observed_entry_fee_variance: '5.1',
      expected_filled_exit_fees: '146.2',
      total_consumed_risk: '2539.2930736933396',
      actual_entry_fee_quantity: '3.2',
      modeled_entry_fee_quantity: '0.1',
    },
    remaining_risk: '252.1069263066604',
    permitted_remainder: '0.36641',
    permitted_total: '3.66641',
    over_budget: '0',
    disposition: 'executable',
  }

  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'BTC')

  assert.deepEqual(trade?.chasePriceRisk, chase.price_risk)
  assert.equal(trade?.chasePriceRisk?.permitted_remainder, '0.36641')
  assert.equal(trade?.chasePriceRisk?.over_budget, '0')
  assert.equal(trade?.chasePriceRisk?.fee_risk?.observed_entry_fee_variance, '5.1')
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
      parameters: { source_command_id: primary.command_id },
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
      quantity: '0.00420001',
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
  assert.equal(trade.pnlEvidenceComplete, true)
  assert.equal(trade.realizedPnl.get('USDC'), '0.3409358124640017')
  assert.equal(trade.venueRealizedPnl.get('USDC'), '999')

  snapshot.close_workflows = []
  const pruned = tradeWorkspaceProjection(snapshot).closedTrades.find((row) => row.symbol === 'ETH')
  assert.ok(pruned)
  assert.equal(pruned.closeOrders.length, 1)
  assert.equal(pruned.pnlEvidenceComplete, true)
  assert.equal(pruned.realizedPnl.get('USDC'), '0.3409358124640017')
})

test('closed scope with missing closing fills does not present entry fees as final P&L', () => {
  const snapshot = engineProjectionSnapshot()
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  assert.ok(position)
  const exposure = position.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.reduced_quantity = exposure.opened_quantity
  exposure.remaining_quantity = '0'
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'

  const trade = tradeWorkspaceProjection(snapshot).closedTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  assert.equal(trade.pnlEvidenceComplete, false)
  assert.equal(trade.realizedPnl.size, 0)
  assert.equal(trade.netAfterFees.size, 0)
  assert.ok(trade.totalFees.size > 0)
})

test('a protection-owned stop fill joins by protection scope, not exposure scope', () => {
  const snapshot = engineProjectionSnapshot()
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  const protection = snapshot.native_protections.find((row) => row.symbol === 'ETH')
  const entry = snapshot.executions.find((row) => row.fill.symbol === 'ETH')
  assert.ok(position && protection && entry)
  const exposure = position.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.reduced_quantity = exposure.opened_quantity
  exposure.remaining_quantity = '0'
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'

  const stopped = structuredClone(entry)
  stopped.event_id = 'stop-exit-event'
  stopped.fill.event_id = stopped.event_id
  stopped.fill.execution_id = 'stop-exit-execution'
  stopped.fill.side = 'sell'
  stopped.fill.price = '1800.125'
  stopped.fill.quantity = exposure.opened_quantity
  stopped.fill.fee = { asset: 'USDC', amount: '0.11' }
  stopped.fill.builder_fee = { asset: 'USDC', amount: '0.03' }
  stopped.fill.realized_pnl = { asset: 'USDC', amount: '999' }
  stopped.order = null
  stopped.protection_owner = {
    scope_id: protection.scope_id,
    scope_revision: protection.scope_revision,
    controller: { kind: 'native', id: protection.protection_id },
    child_id: protection.plan.children.find((child) => child.protection_kind === 'stop_loss')!
      .child_id,
  }
  snapshot.executions.push(stopped)

  const unrelated = structuredClone(stopped)
  unrelated.event_id = 'other-scope-stop'
  unrelated.fill.event_id = unrelated.event_id
  unrelated.fill.execution_id = 'other-scope-stop-execution'
  unrelated.protection_owner!.scope_id = 'different-protection-scope'
  snapshot.executions.push(unrelated)

  const trade = tradeWorkspaceProjection(snapshot).closedTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  assert.equal(trade.pnlEvidenceComplete, true)
  assert.equal(
    trade.executions.some((row) => row.event_id === stopped.event_id),
    true,
  )
  assert.equal(
    trade.executions.some((row) => row.event_id === unrelated.event_id),
    false,
  )
  assert.equal(trade.realizedPnl.get('USDC')?.startsWith('-'), true)
  assert.notEqual(trade.netAfterFees.get('USDC'), trade.totalFees.get('USDC'))
  assert.equal(trade.venueRealizedPnl.get('USDC'), '999')
})

test('copied mainnet-shaped stopped long retains exact final net after scope join', () => {
  const snapshot = engineProjectionSnapshot()
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  const protection = snapshot.native_protections.find((row) => row.symbol === 'ETH')
  const entry = snapshot.executions.find((row) => row.event_id === 'fill-eth-1')
  const order = snapshot.orders.find(
    (row) =>
      row.command_id ===
      snapshot.commands.find((command) => command.accepted.kind === 'place_order')?.command_id,
  )
  assert.ok(position && protection && entry && order)
  snapshot.executions = snapshot.executions.filter((row) => row.fill.symbol !== 'ETH')
  entry.fill.price = '80956'
  entry.fill.quantity = '10.02004'
  entry.fill.fee = { asset: 'USDC', amount: '442.256590' }
  entry.fill.builder_fee = { asset: 'USDC', amount: '100' }
  snapshot.executions.push(entry)
  order.filled_quantity = '10.02004'
  const exposure = position.owned_exposure['scope-filled']
  assert.ok(exposure)
  exposure.opened_quantity = '10.02004'
  exposure.reduced_quantity = '10.02004'
  exposure.remaining_quantity = '0'
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'

  const stop = structuredClone(entry)
  stop.event_id = 'stopped-long-exit'
  stop.fill.event_id = stop.event_id
  stop.fill.execution_id = 'stopped-long-exit'
  stop.fill.side = 'sell'
  stop.fill.price = '80282'
  stop.fill.fee = { asset: 'USDC', amount: '429.565005' }
  stop.fill.builder_fee = { asset: 'USDC', amount: '80' }
  stop.order = null
  stop.protection_owner = {
    scope_id: protection.scope_id,
    scope_revision: protection.scope_revision,
    controller: { kind: 'native', id: protection.protection_id },
    child_id: protection.plan.children.find((child) => child.protection_kind === 'stop_loss')!
      .child_id,
  }
  snapshot.executions.push(stop)

  const trade = tradeWorkspaceProjection(snapshot).closedTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  assert.equal(trade.pnlEvidenceComplete, true)
  assert.equal(trade.realizedPnl.get('USDC'), '-6753.50696')
  assert.equal(trade.totalFees.get('USDC'), '871.821595')
  assert.equal(trade.netAfterFees.get('USDC'), '-7625.328555')
})

test('a missing owned-exposure row cannot turn entry fees into final closed-trade P&L', () => {
  const snapshot = engineProjectionSnapshot()
  const position = snapshot.positions.find((row) => row.symbol === 'ETH')
  assert.ok(position)
  delete position.owned_exposure['scope-filled']
  position.exchange_quantity.long = '0'
  position.owned_quantity.long = '0'

  const workspace = tradeWorkspaceProjection(snapshot)
  const trade = [...workspace.activeTrades, ...workspace.closedTrades].find(
    (row) => row.symbol === 'ETH',
  )
  assert.ok(trade)
  assert.ok(trade.totalFees.size > 0)
  assert.equal(trade.pnlEvidenceComplete, false)
  assert.equal(trade.netAfterFees.size, 0)
})

test('scope P&L stays incomplete when entry fills or fee assets are inconsistent', () => {
  const missing = engineProjectionSnapshot()
  missing.executions = missing.executions.filter((row) => row.fill.symbol !== 'ETH')
  const missingTrade = tradeWorkspaceProjection(missing).activeTrades.find(
    (row) => row.symbol === 'ETH',
  )
  assert.ok(missingTrade)
  assert.equal(missingTrade.pnlEvidenceComplete, false)

  const mixed = engineProjectionSnapshot()
  const ethFill = mixed.executions.find((row) => row.fill.symbol === 'ETH')
  assert.ok(ethFill)
  ethFill.fill.fee = { asset: 'BTC', amount: '0.00001' }
  const mixedTrade = tradeWorkspaceProjection(mixed).activeTrades.find(
    (row) => row.symbol === 'ETH',
  )
  assert.ok(mixedTrade)
  assert.equal(mixedTrade.pnlEvidenceComplete, false)
  assert.equal(mixedTrade.pnlAsset, null)

  const unknownFee = engineProjectionSnapshot()
  const unpriced = unknownFee.executions.find((row) => row.fill.symbol === 'ETH')
  assert.ok(unpriced)
  unpriced.fill.fee = null
  const unknownTrade = tradeWorkspaceProjection(unknownFee).activeTrades.find(
    (row) => row.symbol === 'ETH',
  )
  assert.ok(unknownTrade)
  assert.equal(unknownTrade.pnlEvidenceComplete, false)
})

test('scoped P&L follows a single observed settlement asset instead of assuming USDC', () => {
  const snapshot = engineProjectionSnapshot()
  for (const row of snapshot.executions.filter((execution) => execution.fill.symbol === 'ETH')) {
    if (row.fill.fee !== null) row.fill.fee.asset = 'USDT'
    if (row.fill.builder_fee !== null) row.fill.builder_fee.asset = 'USDT'
    if (row.fill.realized_pnl !== null) row.fill.realized_pnl.asset = 'USDT'
  }
  const trade = tradeWorkspaceProjection(snapshot).activeTrades.find((row) => row.symbol === 'ETH')
  assert.ok(trade)
  assert.equal(trade.pnlAsset, 'USDT')
  assert.equal(trade.pnlEvidenceComplete, true)
  assert.equal(trade.netAfterFees.has('USDT'), true)
  assert.equal(trade.netAfterFees.has('USDC'), false)
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
