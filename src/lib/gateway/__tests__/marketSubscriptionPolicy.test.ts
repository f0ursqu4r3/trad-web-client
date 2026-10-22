import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyMarketError,
  MARKET_RETRY_MAX_ATTEMPTS,
  MarketRetryScheduler,
  marketRetryDelay,
  marketSymbolDecision,
  type MarketCatalogState,
  type Timers,
} from '../marketSubscriptionPolicy.ts'

class ManualClock implements Timers {
  now = 0
  private nextId = 1
  private readonly pending = new Map<number, { at: number; callback: () => void }>()

  set = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++
    this.pending.set(id, { at: this.now + delayMs, callback })
    return id
  }

  clear = (timer: number): void => {
    this.pending.delete(timer)
  }

  advance(ms: number): void {
    const until = this.now + ms
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0]
      if (due === undefined) break
      const [id, timer] = due
      this.pending.delete(id)
      this.now = timer.at
      timer.callback()
    }
    this.now = until
  }

  get size(): number {
    return this.pending.size
  }
}

const catalog: MarketCatalogState = { status: 'ready', symbols: ['BTC', 'ETH', 'SOL', 'ZEC'] }

test('only a listed market symbol may be subscribed', () => {
  assert.equal(marketSymbolDecision('', catalog), 'none')
  assert.equal(marketSymbolDecision('  ', catalog), 'none')
  assert.equal(marketSymbolDecision('Z', catalog), 'unknown')
  assert.equal(marketSymbolDecision('ZE', catalog), 'unknown')
  assert.equal(marketSymbolDecision('ZEC', catalog), 'subscribe')
  assert.equal(marketSymbolDecision(' zec ', catalog), 'subscribe')
  assert.equal(marketSymbolDecision('ZEC', { status: 'loading' }), 'wait')
  // Without a catalog the gateway judges the selected symbol.
  assert.equal(marketSymbolDecision('ZEC', { status: 'unavailable' }), 'subscribe')
})

test('market errors that cannot succeed are never retried', () => {
  assert.equal(
    classifyMarketError({ kind: 'unavailable', reason: 'busy', retryable: true }),
    'retry',
  )
  assert.equal(
    classifyMarketError({ kind: 'unavailable', reason: 'feed closed', retryable: false }),
    'final',
  )
  assert.equal(
    classifyMarketError({ kind: 'unavailable', reason: 'unknown market ZE', retryable: false }),
    'unknown_market',
  )
  assert.equal(
    classifyMarketError({ kind: 'unavailable', reason: 'coin not listed', retryable: false }),
    'unknown_market',
  )
  assert.equal(classifyMarketError({ kind: 'unknown_market', reason: 'ZE' }), 'unknown_market')
  assert.equal(classifyMarketError({ kind: 'unknown_market' }), 'unknown_market')
  // An unknown market stays unknown even if a server marks it retryable.
  assert.equal(classifyMarketError({ kind: 'unknown_market', retryable: true }), 'unknown_market')
  assert.equal(classifyMarketError({ kind: 'unauthorized' }), 'final')
  assert.equal(classifyMarketError({ kind: 'invalid_request', reason: 'bad' }), 'final')
})

test('retries back off and stop at the cap', () => {
  const delays = Array.from({ length: MARKET_RETRY_MAX_ATTEMPTS + 1 }, (_, attempt) =>
    marketRetryDelay(attempt),
  )
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, null])

  const clock = new ManualClock()
  const resubscribed: string[] = []
  const retries = new MarketRetryScheduler(
    () => true,
    (key) => resubscribed.push(key),
    clock,
  )
  for (let attempt = 0; attempt < MARKET_RETRY_MAX_ATTEMPTS; attempt += 1) {
    assert.equal(retries.schedule('a:BTC'), 'scheduled')
    assert.equal(retries.schedule('a:BTC'), 'pending')
    clock.advance(30_000)
  }
  assert.equal(resubscribed.length, MARKET_RETRY_MAX_ATTEMPTS)
  assert.equal(retries.attempts('a:BTC'), MARKET_RETRY_MAX_ATTEMPTS)
  assert.equal(retries.exhausted('a:BTC'), true)
  assert.equal(retries.schedule('a:BTC'), 'exhausted')
  clock.advance(60_000)
  assert.equal(resubscribed.length, MARKET_RETRY_MAX_ATTEMPTS)

  retries.cancel('a:BTC')
  assert.equal(retries.attempts('a:BTC'), 0)
  assert.equal(retries.schedule('a:BTC'), 'scheduled')
})

test('changing symbol cancels the old retry and never resubscribes it', () => {
  const clock = new ManualClock()
  const wanted = new Set(['a:ZE', 'a:BTC'])
  const resubscribed: string[] = []
  const retries = new MarketRetryScheduler(
    (key) => wanted.has(key),
    (key) => resubscribed.push(key),
    clock,
  )

  assert.equal(retries.schedule('a:ZE'), 'scheduled')
  assert.equal(retries.schedule('a:BTC'), 'scheduled')
  // The ticket moves on to ZEC: ZE is released and its retry cancelled.
  wanted.delete('a:ZE')
  retries.cancel('a:ZE')
  wanted.add('a:ZEC')
  clock.advance(60_000)

  assert.deepEqual(resubscribed, ['a:BTC'])
  assert.equal(retries.attempts('a:ZE'), 0)
})

test('a retry that fires after its market was let go does nothing', () => {
  const clock = new ManualClock()
  const wanted = new Set(['a:ZE'])
  const resubscribed: string[] = []
  const retries = new MarketRetryScheduler(
    (key) => wanted.has(key),
    (key) => resubscribed.push(key),
    clock,
  )

  retries.schedule('a:ZE')
  wanted.delete('a:ZE')
  clock.advance(60_000)
  assert.deepEqual(resubscribed, [])
  assert.equal(retries.schedule('a:ZE'), 'unwanted')
})
