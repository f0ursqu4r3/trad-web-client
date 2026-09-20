import assert from 'node:assert/strict'
import test from 'node:test'

import { marketSampleAgeBucket, marketStreamEvent } from '../marketObservation.ts'
import { safeTelemetryProperties } from '../validation.ts'

const accountId = '1bd8d827-7e0b-52aa-a214-420a92c5fda0'
const requestId = 'f305b7fa-3d65-4ced-b5e1-564c8001f41c'

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
