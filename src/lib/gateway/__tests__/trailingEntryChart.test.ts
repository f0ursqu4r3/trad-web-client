import assert from 'node:assert/strict'
import test from 'node:test'

import {
  jumpBasisPointsForPrice,
  jumpTriggerPrice,
  marketSamplesThroughTrade,
  sampleAtTrailingEntryPoint,
  trailingEntryChartLines,
} from '../../chart/trailingEntryChart.ts'
import type { BrowserMarketSample } from '../market.ts'
import type { TrailingEntryProjection } from '../projection.ts'

test('Trailing Entry lines follow the authoritative long and short jump semantics', () => {
  assert.equal(jumpTriggerPrice('long', 50_000, 10), 50_050)
  assert.equal(jumpTriggerPrice('short', 50_000, 10), 49_950)
  assert.equal(jumpBasisPointsForPrice('long', 50_000, 50_050), '10')
  assert.equal(jumpBasisPointsForPrice('short', 50_000, 49_950), '10')

  const lines = trailingEntryChartLines(entry())
  assert.deepEqual(
    lines.map(({ id, editable }) => [id, editable]),
    [
      ['activation_price', false],
      ['stop_loss', true],
      ['take_profit', true],
      ['peak_price', false],
      ['jump_trigger', true],
    ],
  )
})

test('projected point indices map through the exact latest trade identity', () => {
  const row = entry()
  row.point_count = 8
  row.latest_trade = {
    generation: 2,
    exchange_time: 300,
    trade_id: 'latest',
    price: '49950',
  }
  const samples = [sample(20, 'old', 100), sample(24, 'activation', 200), sample(30, 'latest', 300)]

  assert.equal(sampleAtTrailingEntryPoint(samples, row, 6)?.trade_id, 'activation')
  assert.equal(sampleAtTrailingEntryPoint(samples, row, 7)?.trade_id, 'latest')
})

test('terminal chart history stops at the exact final trade', () => {
  const samples = [
    sample(20, 'before', 100),
    sample(21, 'terminal', 200),
    sample(22, 'same-millisecond-later-trade', 200),
    sample(23, 'after', 300),
  ]

  assert.deepEqual(
    marketSamplesThroughTrade(samples, {
      generation: 2,
      exchange_time: 200,
      trade_id: 'terminal',
      price: '50000',
    }).map((row) => row.trade_id),
    ['before', 'terminal'],
  )
})

test('terminal chart history fails closed when the exact final trade is outside the window', () => {
  const samples = [
    sample(20, 'before', 100),
    sample(21, 'same-millisecond-unknown', 200),
    sample(22, 'after', 300),
  ]

  assert.deepEqual(
    marketSamplesThroughTrade(samples, {
      generation: 2,
      exchange_time: 200,
      trade_id: 'terminal-not-in-window',
      price: '50000',
    }).map((row) => row.trade_id),
    ['before'],
  )
  assert.deepEqual(marketSamplesThroughTrade(samples, null), [])
})

function entry(): TrailingEntryProjection {
  return {
    trailing_entry_id: 'te',
    command_id: 'command',
    state_revision: 1,
    mutation_command_ids: [],
    plan: {
      symbol: 'BTC',
      position_side: 'long',
      activation_price: '50100',
      jump_threshold: '10',
      stop_loss: '49000',
      take_profit: '52000',
      risk_amount: '100',
      instrument: {},
      execution: {},
    },
    phase: 'tracking',
    lifecycle: 'running',
    market_generation: 2,
    market_stale: false,
    cursor: null,
    latest_trade: null,
    latest_trade_received_at: null,
    point_count: 0,
    actual_activation_price: '50000',
    activation_point_index: 6,
    peak: '50000',
    peak_point_index: 7,
    trigger: null,
    continuations: [],
    entry_cancel_requested: false,
    close_workflow_id: null,
    last_reason: null,
    created_at: 0,
  }
}

function sample(sequence: number, tradeId: string, time: number): BrowserMarketSample {
  return {
    sequence,
    update_id: `update-${sequence}`,
    generation: 2,
    received_at_ms: time,
    exchange_time_ms: time,
    price: '50000',
    trade_id: tradeId,
  }
}
