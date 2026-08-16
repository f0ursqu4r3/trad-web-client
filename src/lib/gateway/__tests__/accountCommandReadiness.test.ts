import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACCOUNT_ENGINE_INITIALIZING_MESSAGE,
  GATEWAY_RECONNECTING_MESSAGE,
  HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE,
  accountCommandReadiness,
} from '../accountCommandReadiness.ts'

test('account commands require the gateway connection', () => {
  assert.deepEqual(accountCommandReadiness(false, 'ready'), {
    ready: false,
    reason: GATEWAY_RECONNECTING_MESSAGE,
  })
})

test('account commands remain blocked while the owner projection is not ready', () => {
  for (const status of [undefined, null, 'idle', 'subscribing', 'stale', 'error'] as const) {
    assert.deepEqual(accountCommandReadiness(true, status), {
      ready: false,
      reason: ACCOUNT_ENGINE_INITIALIZING_MESSAGE,
    })
  }
})

test('account commands unlock after the authoritative account snapshot arrives', () => {
  assert.deepEqual(accountCommandReadiness(true, 'ready'), {
    ready: true,
    reason: null,
  })
})

test('Hyperliquid commands remain blocked until the agent wallet is approved', () => {
  assert.deepEqual(accountCommandReadiness(true, 'ready', false), {
    ready: false,
    reason: HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE,
  })
})
