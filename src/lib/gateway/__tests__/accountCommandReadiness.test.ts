import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACCOUNT_ENGINE_INITIALIZING_MESSAGE,
  GATEWAY_RECONNECTING_MESSAGE,
  HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE,
  ACCOUNT_RECONCILING_MESSAGE,
  accountCommandReadiness,
  newExposureReadiness,
  newExposureSymbol,
  type NewRiskCheckpoint,
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

function checkpoint(
  reconciliationReady: boolean,
  extra: {
    new_risk_blocked_reason?: string | null
    new_risk_blocked_symbols?: Record<string, string>
  } = {},
): NewRiskCheckpoint {
  return {
    summary: { reconciliation_ready: reconciliationReady } as NewRiskCheckpoint['summary'],
    ...extra,
  }
}

test('new exposure waits for server reconciliation without blocking exits', () => {
  const command = accountCommandReadiness(true, 'ready')
  assert.deepEqual(newExposureReadiness(command, checkpoint(false)), {
    ready: false,
    reason: ACCOUNT_RECONCILING_MESSAGE,
  })
  assert.deepEqual(newExposureReadiness(command, undefined), {
    ready: false,
    reason: ACCOUNT_RECONCILING_MESSAGE,
  })
  assert.deepEqual(newExposureReadiness(command, checkpoint(true)), { ready: true, reason: null })
  assert.deepEqual(command, { ready: true, reason: null })
})

test('an account-level block shows the engine reason', () => {
  const command = accountCommandReadiness(true, 'ready')
  assert.deepEqual(
    newExposureReadiness(
      command,
      checkpoint(false, {
        new_risk_blocked_reason: 'the outcome of position mode change 7 is unknown',
      }),
    ),
    {
      ready: false,
      reason:
        'New trades are paused: the outcome of position mode change 7 is unknown. Closing and canceling remain available.',
    },
  )
})

test('a coin-level block refuses new risk on that coin only', () => {
  const command = accountCommandReadiness(true, 'ready')
  const blocked = checkpoint(true, {
    new_risk_blocked_symbols: { ETH: "Trad's ETH trades own more than the venue position holds" },
  })
  assert.deepEqual(newExposureReadiness(command, blocked, 'eth'), {
    ready: false,
    reason:
      "New ETH trades are paused: Trad's ETH trades own more than the venue position holds. Closing and canceling remain available.",
  })
  assert.deepEqual(newExposureReadiness(command, blocked, 'BTC'), { ready: true, reason: null })
  assert.deepEqual(newExposureReadiness(command, blocked), { ready: true, reason: null })
})

test('new-risk intents name the coin they open on', () => {
  assert.equal(
    newExposureSymbol({
      kind: 'place_chase',
      parameters: {
        symbol: 'ETH',
        position_side: 'long',
        sizing: { kind: 'base', quantity: '1' },
        remainder: 'cancel',
      },
    }),
    'ETH',
  )
  assert.equal(
    newExposureSymbol({
      kind: 'activate_trailing_entry',
      parameters: {
        trailing_entry_id: 'te',
        expected: { state_revision: 1, phase: 'waiting_for_activation', lifecycle: 'running' },
      },
    }),
    null,
  )
})
