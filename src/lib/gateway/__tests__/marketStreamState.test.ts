import assert from 'node:assert/strict'
import test from 'node:test'

import { disconnectedStream } from '../marketStreamState.ts'
import {
  cardMarketStreamEvent,
  marketErrorCause,
  marketStreamCauses,
} from '../../telemetry/marketObservation.ts'

const accountId = '1bd8d827-7e0b-52aa-a214-420a92c5fda0'

function stream(overrides: Partial<Parameters<typeof disconnectedStream>[0]> = {}) {
  return {
    status: 'ready' as const,
    requestId: null,
    subscriptionId: '50000000-0000-4000-8000-000000000002',
    error: null,
    cause: null,
    unknownMarket: false,
    ...overrides,
  }
}

test('a socket that reconnects puts its markets in reconnecting, not error', () => {
  for (const before of [
    stream(),
    stream({ status: 'subscribing', subscriptionId: null }),
    stream({ status: 'reconnecting', cause: marketStreamCauses.feedUnavailable }),
    stream({ status: 'error', cause: marketStreamCauses.retriesExhausted }),
  ]) {
    const after = disconnectedStream(before, 'gateway socket closed (code 1006)', true)
    assert.equal(after.status, 'reconnecting')
    assert.equal(after.subscriptionId, null)
    assert.equal(after.requestId, null)
    assert.deepEqual(after.cause, { outcomeCode: 'transport_interrupted' })
    const event = cardMarketStreamEvent(accountId, 'BTC', after, null)
    assert.equal(event.properties?.state, 'reconnecting')
    assert.equal(event.properties?.outcome_code, 'transport_interrupted')
  }
})

test('a stopped socket fails its markets with the transport cause', () => {
  const after = disconnectedStream(stream(), 'gateway disconnected', false)
  assert.equal(after.status, 'error')
  assert.equal(after.error, 'gateway disconnected')
  const event = cardMarketStreamEvent(accountId, 'ETH', after, null)
  assert.equal(event.properties?.state, 'error')
  assert.equal(event.properties?.outcome_code, 'transport_interrupted')
})

test('a market the exchange refused keeps its error through a reconnect', () => {
  const refused = stream({
    status: 'error',
    subscriptionId: null,
    error: 'Unknown market: ZZZ',
    cause: marketErrorCause('unknown_market'),
    unknownMarket: true,
  })
  const after = disconnectedStream(refused, 'gateway socket closed', true)
  assert.equal(after.status, 'error')
  assert.equal(after.error, 'Unknown market: ZZZ')
  assert.equal(after.unknownMarket, true)
  assert.equal(
    cardMarketStreamEvent(accountId, 'ZZZ', after, null).properties?.reason_code,
    'invalid_request',
  )
})
