import assert from 'node:assert/strict'
import test from 'node:test'

import type { BrowserMarketSample } from '../market.ts'
import { appendMarketSamples, installMarketWindow, MAX_MARKET_SAMPLES } from '../marketWindow.ts'

test('market windows retain exact decimal text and replace prior history', () => {
  const first = installMarketWindow({
    symbol: 'BTC',
    oldest_sequence: 4,
    next_sequence: 8,
    samples: [sample(4, '50000.00000001'), sample(7, '50000.00000002')],
  })
  const replacement = installMarketWindow({
    symbol: 'BTC',
    oldest_sequence: 20,
    next_sequence: 21,
    samples: [sample(20, '49999.99999999')],
  })

  assert.equal(first.samples[0]?.price, '50000.00000001')
  assert.deepEqual(
    replacement.samples.map(({ sequence }) => sequence),
    [20],
  )
  assert.equal(replacement.oldestSequence, 20)
  assert.equal(replacement.nextSequence, 21)
})

test('global sequence gaps are accepted but overlap and reordering are rejected', () => {
  const initial = installMarketWindow({
    symbol: 'ETH',
    oldest_sequence: 10,
    next_sequence: 13,
    samples: [sample(10, '2000'), sample(12, '2001')],
  })
  const appended = appendMarketSamples(initial, [sample(15, '2002'), sample(19, '2003')])

  assert.deepEqual(
    appended.samples.map(({ sequence }) => sequence),
    [10, 12, 15, 19],
  )
  assert.equal(appended.nextSequence, 20)
  assert.throws(() => appendMarketSamples(appended, [sample(19, '2004')]), /overlapping/)
  assert.throws(
    () => appendMarketSamples(appended, [sample(22, '2004'), sample(21, '2005')]),
    /out of order/,
  )
})

test('market history remains bounded at the browser contract limit', () => {
  const samples = Array.from({ length: MAX_MARKET_SAMPLES + 20 }, (_, index) =>
    sample(index, String(index)),
  )
  const window = installMarketWindow({
    symbol: 'SOL',
    oldest_sequence: 0,
    next_sequence: samples.length,
    samples,
  })

  assert.equal(window.samples.length, MAX_MARKET_SAMPLES)
  assert.equal(window.oldestSequence, 20)
  assert.equal(window.nextSequence, MAX_MARKET_SAMPLES + 20)
})

function sample(sequence: number, price: string): BrowserMarketSample {
  return {
    sequence,
    update_id: `update-${sequence}`,
    generation: 1,
    received_at_ms: sequence,
    exchange_time_ms: sequence,
    price,
    trade_id: `trade-${sequence}`,
  }
}
