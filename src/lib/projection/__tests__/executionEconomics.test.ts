import assert from 'node:assert/strict'
import test from 'node:test'

import type { ExecutionProjection } from '../../gateway/index.ts'
import { addExact, multiplyExact, subtractExact } from '../../exactDecimalMath.ts'
import { formatExactAssetTotals, summarizeProjectionExecutions } from '../executionEconomics.ts'

test('exact decimal arithmetic never rounds through JavaScript numbers', () => {
  assert.equal(addExact('9007199254740993.00000001', '0.00000009'), '9007199254740993.0000001')
  assert.equal(subtractExact('1', '1.00000001'), '-0.00000001')
  assert.equal(multiplyExact('1918.90000001', '0.00420001'), '8.0593991890420001')
})

test('projection economics preserve exact fee components by asset', () => {
  const economics = summarizeProjectionExecutions([
    execution('0.003223456789', '0.001111111111', null),
    execution('0.000000000001', '0.000000000001', '2.5'),
  ])

  assert.equal(formatExactAssetTotals(economics.totalFees), '0.00322345679 USDC')
  assert.equal(formatExactAssetTotals(economics.builderFees), '0.001111111112 USDC')
  assert.equal(formatExactAssetTotals(economics.exchangeFees), '0.002112345678 USDC')
  assert.equal(formatExactAssetTotals(economics.realizedPnl), '2.5 USDC')
  assert.equal(formatExactAssetTotals(economics.netAfterFees), '2.49677654321 USDC')
})

function execution(
  fee: string,
  builderFee: string,
  realizedPnl: string | null,
): ExecutionProjection {
  return {
    event_id: crypto.randomUUID(),
    reconciliation_required: false,
    order: null,
    fill: {
      event_id: crypto.randomUUID(),
      execution_id: null,
      symbol: 'ETH',
      client_order_id: null,
      remote_order_id: null,
      side: 'buy',
      position_side: 'long',
      price: '1918.90000001',
      quantity: '0.00420001',
      occurred_at: 1,
      is_maker: false,
      fee: { asset: 'USDC', amount: fee },
      builder_fee: { asset: 'USDC', amount: builderFee },
      realized_pnl: realizedPnl === null ? null : { asset: 'USDC', amount: realizedPnl },
      start_position: '0',
      transaction_hash: null,
    },
  }
}
