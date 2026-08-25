import assert from 'node:assert/strict'
import test from 'node:test'

import { stopPriceFromReference } from '../stopPricePresets.ts'

test('places long stops below and short stops above the exact reference', () => {
  assert.equal(stopPriceFromReference('77000', 'long', '5'), '73150')
  assert.equal(stopPriceFromReference('77000', 'short', '5'), '80850')
  assert.equal(stopPriceFromReference('64123.4', 'long', '0.5'), '63802.78')
  assert.equal(stopPriceFromReference('0.012345', 'short', '2'), '0.012592')
})

test('rejects missing, malformed, and nonpositive references', () => {
  assert.throws(() => stopPriceFromReference('', 'long', '1'))
  assert.throws(() => stopPriceFromReference('market', 'long', '1'))
  assert.throws(() => stopPriceFromReference('0', 'long', '1'))
})
