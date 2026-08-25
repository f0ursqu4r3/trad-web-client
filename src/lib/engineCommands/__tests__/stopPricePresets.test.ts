import assert from 'node:assert/strict'
import test from 'node:test'

import { stopPriceFromReference } from '../stopPricePresets.ts'

test('places long stops below and short stops above the exact reference', () => {
  assert.equal(stopPriceFromReference('77000', 'long', '5'), '73150')
  assert.equal(stopPriceFromReference('77000', 'short', '5'), '80850')
  assert.equal(stopPriceFromReference('64123.4', 'long', '0.5'), '63802.78')
  assert.equal(stopPriceFromReference('0.012345', 'short', '2'), '0.012592')
})

test('normalizes Hyperliquid presets to significant figures in the safer direction', () => {
  const btc = { kind: 'hyperliquid_perpetual', sizeDecimals: 5 } as const
  assert.equal(stopPriceFromReference('79275', 'long', '0.5', btc), '78878')
  assert.equal(stopPriceFromReference('79275', 'short', '0.5', btc), '79672')

  const eth = { kind: 'hyperliquid_perpetual', sizeDecimals: 4 } as const
  assert.equal(stopPriceFromReference('2866.7', 'long', '2', eth), '2809.3')
  assert.equal(stopPriceFromReference('2866.7', 'short', '2', eth), '2924.1')

  const lowerPricedPerp = { kind: 'hyperliquid_perpetual', sizeDecimals: 1 } as const
  assert.equal(stopPriceFromReference('0.012345', 'long', '2', lowerPricedPerp), '0.01209')
  assert.equal(stopPriceFromReference('0.012345', 'short', '2', lowerPricedPerp), '0.0126')
})

test('normalizes fixed-tick presets away from the current market', () => {
  const rule = { kind: 'fixed_tick', tick: '0.10' } as const
  assert.equal(stopPriceFromReference('123.47', 'long', '1', rule), '122.2')
  assert.equal(stopPriceFromReference('123.47', 'short', '1', rule), '124.8')
})

test('rejects missing, malformed, and nonpositive references', () => {
  assert.throws(() => stopPriceFromReference('', 'long', '1'))
  assert.throws(() => stopPriceFromReference('market', 'long', '1'))
  assert.throws(() => stopPriceFromReference('0', 'long', '1'))
})
