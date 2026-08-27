import assert from 'node:assert/strict'
import test from 'node:test'

import type { CommandPreview } from '../../gateway/index.ts'
import { affordabilityAdvisory } from '../affordability.ts'

test('warns when planned notional exceeds latest available margin times leverage', () => {
  const result = affordabilityAdvisory(preview('1000'), {
    hyperliquid: true,
    projectionReady: true,
    projectionRevision: 42,
    available: '101.644292',
    configuredLeverage: 1,
  })

  assert.equal(result?.state, 'insufficient_margin_likely')
  assert.equal(result?.estimatedMaximumNotional, '101.644292')
})

test('does not warn when the same balance supports the notional at configured leverage', () => {
  const result = affordabilityAdvisory(preview('1000'), {
    hyperliquid: true,
    projectionReady: true,
    projectionRevision: 42,
    available: '101.644292',
    configuredLeverage: 10,
  })

  assert.equal(result?.state, 'likely_affordable')
  assert.equal(result?.estimatedMaximumNotional, '1016.44292')
})

test('stale or incomplete balance evidence stays unknown and never invents a blocker', () => {
  const result = affordabilityAdvisory(preview('1000'), {
    hyperliquid: true,
    projectionReady: false,
    projectionRevision: 42,
    available: '101.644292',
    configuredLeverage: 1,
  })

  assert.equal(result?.state, 'balance_evidence_unknown')
  assert.equal(result?.estimatedMaximumNotional, null)
  assert.equal(
    affordabilityAdvisory(preview('1000'), {
      hyperliquid: false,
      projectionReady: true,
      projectionRevision: 42,
      available: '101.644292',
      configuredLeverage: 1,
    }),
    null,
  )
})

function preview(notional: string): CommandPreview {
  return {
    kind: 'order',
    symbol: 'BTC',
    position_side: 'long',
    decision_price: '79000',
    price_source: 'best_ask',
    market_observed_at_ms: 1,
    raw_base_quantity: '0.0126',
    normalized_base_quantity: '0.0126',
    normalized_quote_notional: notional,
    children: [{ base_quantity: '0.0126', quote_notional: notional }],
    instrument: {
      price: { kind: 'hyperliquid_perpetual', size_decimals: 5 },
      quantity_step: '0.00001',
      minimum_order_quantity: '0.00001',
      maximum_order_quantity: null,
      minimum_order_notional: '10',
      observed_at_ms: 1,
    },
    warnings: [],
  }
}
