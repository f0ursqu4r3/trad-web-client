import assert from 'node:assert/strict'
import test from 'node:test'

import { hyperliquidAgentName } from '../hyperliquidAgentName.ts'

test('Hyperliquid agent names are stable, short, and unique per Trad account', () => {
  const local = hyperliquidAgentName('187d96a4-cec8-57a4-9e9e-e78b659e6b56')
  const testSite = hyperliquidAgentName('93b884dc-a1e2-5e45-8568-623c9f14c39e')

  assert.equal(local, 'trad-187d96a4')
  assert.equal(testSite, 'trad-93b884dc')
  assert.notEqual(local, testSite)
  assert.ok(local.length <= 16)
  assert.ok(testSite.length <= 16)
})

test('Hyperliquid agent naming rejects malformed account identities', () => {
  assert.throws(() => hyperliquidAgentName('not-an-account-id'), /valid account UUID/)
})
