import assert from 'node:assert/strict'
import test from 'node:test'

import type { BrowserMarketSample } from '../market.ts'
import { MarketSampleBuffer } from '../marketSampleBuffer.ts'
import { appendMarketSamples, MAX_MARKET_SAMPLES } from '../marketWindow.ts'

const BTC = { subscriptionId: 'sub-btc', accountId: 'account', symbol: 'BTC' }
const ETH = { subscriptionId: 'sub-eth', accountId: 'account', symbol: 'ETH' }

test('messages for one market collapse into one batch per flush', () => {
  const buffer = new MarketSampleBuffer()
  buffer.push(BTC, [sample(5), sample(6)], 5)
  buffer.push(ETH, [sample(2)], 2)
  buffer.push(BTC, [sample(7)], 5)
  buffer.push(BTC, [], 5)

  const drained = buffer.drain()
  assert.deepEqual(
    drained.map((entry) => [entry.symbol, entry.samples.map(({ sequence }) => sequence)]),
    [
      ['BTC', [5, 6, 7]],
      ['ETH', [2]],
    ],
  )
  assert.equal(buffer.size, 0)
  assert.deepEqual(buffer.drain(), [])
})

test('held samples must continue the applied window and each other', () => {
  const buffer = new MarketSampleBuffer()
  assert.throws(() => buffer.push(BTC, [sample(4)], 5), /overlapping or out of order/)
  buffer.push(BTC, [sample(5), sample(6)], 5)
  // A rejected message drops what was held for that subscription so the
  // caller can request a fresh window.
  assert.throws(() => buffer.push(BTC, [sample(6)], 5), /overlapping or out of order/)
  assert.equal(buffer.size, 0)
  // Unknown window position: only the order within held samples is checked.
  buffer.push(ETH, [sample(1), sample(9)], null)
  assert.throws(() => buffer.push(ETH, [sample(9)], null), /overlapping or out of order/)
})

test('a long background stretch keeps only what the market window would keep', () => {
  const buffer = new MarketSampleBuffer()
  let sequence = 1
  for (let message = 0; message < 900; message += 1) {
    buffer.push(BTC, [sample(sequence), sample(sequence + 1)], 1)
    sequence += 2
  }
  assert.equal(buffer.sampleCount(), MAX_MARKET_SAMPLES)

  const held = buffer.drain()[0]!
  const applied = appendMarketSamples(
    { oldestSequence: 1, nextSequence: 1, samples: [] },
    held.samples,
  )
  const unbuffered = Array.from({ length: 1_800 }, (_, index) => sample(index + 1)).slice(
    -MAX_MARKET_SAMPLES,
  )
  assert.deepEqual(applied.samples, unbuffered)
  assert.equal(applied.nextSequence, 1_801)
})

test('discarding a released market forgets only that market', () => {
  const buffer = new MarketSampleBuffer()
  buffer.push(BTC, [sample(1)], 1)
  buffer.push(ETH, [sample(1)], 1)
  buffer.discard(BTC.subscriptionId)
  assert.deepEqual(
    buffer.drain().map((entry) => entry.symbol),
    ['ETH'],
  )
})

function sample(sequence: number): BrowserMarketSample {
  return {
    sequence,
    update_id: `update-${sequence}`,
    generation: sequence,
    received_at_ms: 1_000 + sequence,
    exchange_time_ms: 1_000 + sequence,
    price: String(100 + sequence),
    trade_id: `trade-${sequence}`,
  }
}
