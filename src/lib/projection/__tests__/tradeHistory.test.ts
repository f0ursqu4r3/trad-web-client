import assert from 'node:assert/strict'
import test from 'node:test'

import type { ExecutionProjection, OrderProjection, TradeSummary } from '../../gateway/index.ts'
import {
  pagedClosedTrades,
  summaryMatches,
  summaryNet,
  tradeFillsIncomplete,
} from '../tradeHistory.ts'
import type { ManagedTradeView } from '../tradeWorkspaceTypes.ts'

function summary(id: string, fields: Partial<TradeSummary> = {}): TradeSummary {
  return {
    trade_id: id,
    revision: 1,
    symbol: 'BTC',
    side: 'long',
    entry_label: 'Market',
    lifecycle: 'closed',
    primary_command_id: `command-${id}`,
    pnl_asset: 'USDC',
    pnl_evidence_complete: true,
    net_after_fees: [{ asset: 'USDC', amount: '12.5' }],
    reduced_quantity: '0',
    fill_count: 0,
    ...fields,
  } as TradeSummary
}

function fill(eventId: string, orderId: string | null, quantity: string): ExecutionProjection {
  return {
    event_id: eventId,
    order: orderId === null ? null : { order_id: orderId, generation: 1 },
    fill: { quantity, price: '100', occurred_at: 1 },
    reconciliation_required: false,
  } as ExecutionProjection
}

function trade(fields: Partial<ManagedTradeView> = {}): ManagedTradeView {
  return {
    tradeId: 'scope:t1',
    scopeId: 't1',
    lifecycle: 'closed',
    executions: [],
    entryOrders: [{ order_id: 'entry' } as OrderProjection],
    exposure: null,
    ...fields,
  } as ManagedTradeView
}

test('paged rows skip trades shown as cards and take a newer socket summary', () => {
  const live = new Map([
    ['b', summary('b', { revision: 5, symbol: 'ETH' })],
    ['c', summary('c', { revision: 1 })],
  ])
  const rows = pagedClosedTrades(
    [summary('a'), summary('b', { revision: 3 }), summary('c', { revision: 2 }), summary('d')],
    new Set(['d']),
    live,
  )
  assert.deepEqual(
    rows.map((row) => [row.trade_id, row.revision, row.symbol]),
    [
      ['a', 1, 'BTC'],
      ['b', 5, 'ETH'],
      ['c', 2, 'BTC'],
    ],
  )
  assert.equal(pagedClosedTrades([summary('a')], new Set(), null).length, 1)
})

test('the workspace search reads summary fields', () => {
  const row = summary('5100abcd', { symbol: 'ZEC', entry_label: 'Chase' })
  assert.ok(summaryMatches(row, ''))
  assert.ok(summaryMatches(row, 'zec'))
  assert.ok(summaryMatches(row, 'chase'))
  assert.ok(summaryMatches(row, '5100ab'))
  assert.ok(summaryMatches(row, 'command-5100'))
  assert.ok(!summaryMatches(row, 'btc'))
})

test('final net is shown only with complete evidence, never after a takeover', () => {
  assert.deepEqual(summaryNet(summary('a')), {
    label: '+12.5 USDC',
    tone: 'gain',
    title: 'Final net after fees: 12.5 USDC',
  })
  assert.equal(
    summaryNet(summary('a', { net_after_fees: [{ asset: 'USDC', amount: '-3' }] })).tone,
    'loss',
  )
  assert.equal(
    summaryNet(summary('a', { lifecycle: 'taken_over', pnl_evidence_complete: false })).label,
    'unknown after takeover',
  )
  assert.equal(summaryNet(summary('a', { pnl_evidence_complete: false })).label, 'incomplete')
  assert.equal(summaryNet(summary('a', { net_after_fees: [] })).label, '-')
})

test('a card loads server fills when the snapshot lacks some or outside activity reduced it', () => {
  const entry = fill('e1', 'entry', '2')
  const close = fill('e2', 'close', '1')
  // All fills present, own closes cover the reduction.
  assert.equal(
    tradeFillsIncomplete(
      trade({ executions: [entry, close] }),
      summary('t1', { fill_count: 2, reduced_quantity: '1' }),
    ),
    false,
  )
  // The server counts a fill the snapshot does not hold.
  assert.equal(
    tradeFillsIncomplete(trade({ executions: [entry] }), summary('t1', { fill_count: 2 })),
    true,
  )
  // Reduced by more than its own close and protection fills: manual fills.
  assert.equal(
    tradeFillsIncomplete(
      trade({ executions: [entry, close] }),
      summary('t1', { fill_count: 2, reduced_quantity: '2' }),
    ),
    true,
  )
  // Without a server summary the exposure says the same.
  assert.equal(
    tradeFillsIncomplete(
      trade({
        executions: [entry],
        exposure: { reduced_quantity: '0.5' } as ManagedTradeView['exposure'],
      }),
      null,
    ),
    true,
  )
  assert.equal(tradeFillsIncomplete(trade({ lifecycle: 'taken_over' }), null), true)
  assert.equal(tradeFillsIncomplete(trade({ executions: [entry] }), null), false)
})
