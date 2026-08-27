import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHyperliquidCapacity } from '../hyperliquidCapacity.ts'

const response = {
  leverage: { type: 'cross', value: 1 },
  availableToTrade: ['101.644292', '98.5'],
  maxTradeSzs: ['0.00127', '0.00123'],
}

test('selects exact side-specific Hyperliquid capacity', () => {
  assert.deepEqual(parseHyperliquidCapacity(response, 'long', 123), {
    availableToTrade: '101.644292',
    maximumBaseQuantity: '0.00127',
    effectiveLeverage: 1,
    marginMode: 'cross',
    observedAtMs: 123,
  })
  assert.equal(parseHyperliquidCapacity(response, 'short', 124).maximumBaseQuantity, '0.00123')
})

test('rejects malformed, negative, or nonintegral capacity evidence', () => {
  assert.throws(() => parseHyperliquidCapacity({ ...response, maxTradeSzs: ['-1', '1'] }, 'long', 1))
  assert.throws(() =>
    parseHyperliquidCapacity(
      { ...response, leverage: { type: 'cross', value: 1.5 } },
      'long',
      1,
    ),
  )
})
