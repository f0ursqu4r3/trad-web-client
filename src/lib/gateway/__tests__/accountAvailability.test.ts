import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_CREATION_EXCHANGES,
  DEFAULT_ACCOUNT_CREATION_EXCHANGE,
} from '../../accountAvailability.ts'

test('account setup exposes only the currently enabled exchanges', () => {
  assert.equal(DEFAULT_ACCOUNT_CREATION_EXCHANGE, 'hyperliquid')
  assert.deepEqual(ACCOUNT_CREATION_EXCHANGES, ['bifake', 'hyperliquid'])
})
