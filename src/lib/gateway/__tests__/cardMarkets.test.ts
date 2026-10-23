import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CardMarketHold,
  recalledCardMarkets,
  rememberCardMarkets,
  type CardMarketStorage,
} from '../cardMarkets.ts'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'

function memoryStorage(): CardMarketStorage & { writes: number; values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    writes: 0,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      this.writes += 1
      values.set(key, value)
    },
  }
}

test('remembers each account’s card coins, deduplicated and bounded', () => {
  const storage = memoryStorage()
  rememberCardMarkets(storage, ACCOUNT, ['eth', 'BTC', 'ETH', '', ...'ABCDEFGHIJ'.split('')])
  assert.deepEqual(recalledCardMarkets(storage, ACCOUNT), [
    'ETH',
    'BTC',
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
  ])
  assert.deepEqual(recalledCardMarkets(storage, '20000000-0000-4000-8000-000000000002'), [])
  const writes = storage.writes
  rememberCardMarkets(storage, ACCOUNT, ['ETH', 'BTC', ...'ABCDEF'.split('')])
  assert.equal(storage.writes, writes, 'an unchanged list is not rewritten')
})

test('broken or missing storage costs only the head start', () => {
  rememberCardMarkets(null, ACCOUNT, ['BTC'])
  assert.deepEqual(recalledCardMarkets(null, ACCOUNT), [])
  const storage = memoryStorage()
  storage.values.set(`trad:card-markets:${ACCOUNT}`, '{not json')
  assert.deepEqual(recalledCardMarkets(storage, ACCOUNT), [])
  storage.values.set(`trad:card-markets:${ACCOUNT}`, '[1,"BTC",null]')
  assert.deepEqual(recalledCardMarkets(storage, ACCOUNT), ['BTC'])
  const throwing: CardMarketStorage = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  rememberCardMarkets(throwing, ACCOUNT, ['BTC'])
  assert.deepEqual(recalledCardMarkets(throwing, ACCOUNT), [])
})

test('a hold takes one reference per coin, once per account, and gives them back', () => {
  const calls: string[] = []
  const hold = new CardMarketHold(
    (accountId, symbol) => {
      if (symbol === 'BAD') throw new Error('market symbol is required')
      calls.push(`+${accountId.slice(0, 1)}:${symbol}`)
    },
    (accountId, symbol) => calls.push(`-${accountId.slice(0, 1)}:${symbol}`),
  )
  hold.hold(ACCOUNT, ['BTC', 'BAD', 'ETH'])
  hold.hold(ACCOUNT, ['BTC', 'ETH'])
  assert.equal(hold.account(), ACCOUNT)
  hold.hold('20000000-0000-4000-8000-000000000002', ['SOL'])
  hold.release()
  hold.release()
  assert.deepEqual(calls, ['+1:BTC', '+1:ETH', '-1:BTC', '-1:ETH', '+2:SOL', '-2:SOL'])
  assert.equal(hold.account(), null)
})
