import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cardMarketStreamEvent,
  marketErrorCause,
  marketSampleAgeBucket,
  marketStreamCauses,
  marketStreamEvent,
  type MarketStreamCause,
} from '../marketObservation.ts'
import { safeTelemetryProperties } from '../validation.ts'

const accountId = '1bd8d827-7e0b-52aa-a214-420a92c5fda0'
const requestId = 'f305b7fa-3d65-4ced-b5e1-564c8001f41c'

test('recoverable health is distinct from a terminal subscription error', () => {
  const record = marketStreamEvent(accountId, 'BTC', 'reconnecting', {
    source: 'feed_health',
    reasonCode: 'unavailable',
  })
  assert.deepEqual(record.properties, {
    market_symbol: 'BTC',
    state: 'reconnecting',
    source: 'feed_health',
    reason_code: 'unavailable',
  })
  assert.deepEqual(safeTelemetryProperties(record.properties ?? {}), record.properties)
})

test('records a bounded market window without price or raw error text', () => {
  const event = marketStreamEvent(
    accountId,
    'ETH',
    'ready',
    {
      requestId,
      source: 'window',
      retryCount: 1,
      sampleCount: 64,
      lastSampleReceivedAtMs: 9_500,
    },
    10_000,
  )
  assert.equal(event.eventName, 'market_stream_state_changed')
  assert.equal(event.requestId, requestId)
  assert.deepEqual(event.properties, {
    market_symbol: 'ETH',
    state: 'ready',
    source: 'window',
    retry_count: 1,
    sample_count: 64,
    market_sample_age_bucket: 'under_1s',
  })
  assert.deepEqual(safeTelemetryProperties(event.properties ?? {}), event.properties)
})

test('distinguishes an empty window, stale sample, and unsafe symbol', () => {
  assert.equal(marketSampleAgeBucket(null, 10_000), 'none')
  assert.equal(marketSampleAgeBucket(0, 61_000), 'stale_over_60s')
  assert.equal(marketSampleAgeBucket(12_000, 10_000), 'clock_skew')
  assert.equal(
    marketStreamEvent(accountId, '@107', 'subscribing').properties?.market_symbol,
    'SPOT:107',
  )
  assert.equal(
    marketStreamEvent(accountId, 'ETH?secret', 'error').properties?.market_symbol,
    'UNKNOWN',
  )
  const stale = marketStreamEvent(
    accountId,
    'ETH',
    'stale',
    { source: 'card', lastSampleReceivedAtMs: 0 },
    16_000,
  )
  assert.equal(stale.properties?.state, 'stale')
  assert.equal(stale.properties?.market_sample_age_bucket, 'stale_under_60s')
  assert.deepEqual(safeTelemetryProperties(stale.properties ?? {}), stale.properties)
})

// The reason codes the gateway collector accepts for market events
// (gateway/src/telemetry/validation.rs, validate_market_observation).
const GATEWAY_MARKET_REASONS = new Set([
  'unauthorized',
  'unavailable',
  'invalid_request',
  'invalid_window',
  'invalid_samples',
  'window_not_installed',
  'send_failed',
  'unknown_market',
])

const errorPaths: Array<[string, MarketStreamCause]> = [
  ['send failed', marketStreamCauses.sendFailed],
  ['request timeout', marketStreamCauses.requestTimeout],
  ['retries exhausted', marketStreamCauses.retriesExhausted],
  ['socket stopped', marketStreamCauses.transportInterrupted],
  ['market_error unauthorized', marketErrorCause('unauthorized')],
  ['market_error unavailable', marketErrorCause('unavailable')],
  ['market_error invalid_request', marketErrorCause('invalid_request')],
  ['market_error unknown_market', marketErrorCause('unknown_market')],
]

for (const [path, cause] of errorPaths) {
  test(`a card error from ${path} says why`, () => {
    const event = cardMarketStreamEvent(accountId, 'BTC', { status: 'error', cause }, null)
    const properties = event.properties ?? {}
    assert.equal(properties.state, 'error')
    assert.equal(properties.source, 'card')
    assert.ok(
      properties.reason_code !== undefined || properties.outcome_code !== undefined,
      `${path} has no reason or outcome`,
    )
    if (properties.reason_code !== undefined) {
      assert.ok(GATEWAY_MARKET_REASONS.has(properties.reason_code), properties.reason_code)
    }
    assert.deepEqual(safeTelemetryProperties(properties), properties)
  })
}

test('a card error carries the exact cause of its path', () => {
  const timeout = cardMarketStreamEvent(
    accountId,
    'ETH',
    { status: 'error', cause: marketStreamCauses.requestTimeout },
    null,
  )
  assert.equal(timeout.properties?.reason_code, 'unavailable')
  assert.equal(timeout.properties?.outcome_code, 'request_timeout')
  const unknown = cardMarketStreamEvent(
    accountId,
    'ETH',
    { status: 'error', cause: marketErrorCause('unknown_market') },
    null,
  )
  assert.equal(unknown.properties?.reason_code, 'invalid_request')
  assert.equal(marketErrorCause('unauthorized').reasonCode, 'unauthorized')
  assert.equal(
    cardMarketStreamEvent(
      accountId,
      'ETH',
      { status: 'error', cause: marketStreamCauses.sendFailed },
      null,
    ).properties?.reason_code,
    'send_failed',
  )
})

test('a reconnecting card reports a feed outage or a socket reconnect', () => {
  const feed = cardMarketStreamEvent(
    accountId,
    'ETH',
    { status: 'reconnecting', cause: marketStreamCauses.feedUnavailable },
    9_000,
    10_000,
  )
  assert.deepEqual(feed.properties, {
    market_symbol: 'ETH',
    state: 'reconnecting',
    source: 'card',
    reason_code: 'unavailable',
    market_sample_age_bucket: 'under_5s',
  })
  const socket = cardMarketStreamEvent(
    accountId,
    'BTC',
    { status: 'reconnecting', cause: marketStreamCauses.transportInterrupted },
    null,
  )
  assert.equal(socket.properties?.state, 'reconnecting')
  assert.equal(socket.properties?.outcome_code, 'transport_interrupted')
  assert.equal(socket.properties?.reason_code, undefined)
  assert.deepEqual(safeTelemetryProperties(socket.properties ?? {}), socket.properties)
})

test('a live or waiting card carries no failure cause', () => {
  const ready = cardMarketStreamEvent(
    accountId,
    'ETH',
    { status: 'ready', cause: marketStreamCauses.feedUnavailable },
    9_500,
    10_000,
  )
  assert.deepEqual(ready.properties, {
    market_symbol: 'ETH',
    state: 'ready',
    source: 'card',
    market_sample_age_bucket: 'under_1s',
  })
  for (const status of ['idle', 'subscribing', 'ready'] as const) {
    const waiting = cardMarketStreamEvent(
      accountId,
      'ETH',
      { status, cause: marketStreamCauses.requestTimeout },
      null,
    )
    assert.equal(waiting.properties?.state, 'waiting_for_sample')
    assert.equal(waiting.properties?.reason_code, undefined)
    assert.equal(waiting.properties?.outcome_code, undefined)
  }
})
