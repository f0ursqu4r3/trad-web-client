import assert from 'node:assert/strict'
import test from 'node:test'

import { tradeFeeSummary } from '../tradeFees.ts'

test('actual trade fees split entry and exit into exchange and builder with a total', () => {
  const summary = tradeFeeSummary({
    entry: [{ asset: 'USDC', exchange_fee: '0.0031', builder_fee: '0.0024' }],
    exit: [
      { asset: 'USDC', exchange_fee: '0.0015', builder_fee: '0.0012' },
      { asset: 'HYPE', exchange_fee: '0.01', builder_fee: '0' },
    ],
    fills_without_fee: 0,
    apportioned: false,
  })

  assert.deepEqual(summary?.entry.exchange, new Map([['USDC', '0.0031']]))
  assert.deepEqual(summary?.entry.builder, new Map([['USDC', '0.0024']]))
  assert.deepEqual(
    summary?.exit.exchange,
    new Map([
      ['USDC', '0.0015'],
      ['HYPE', '0.01'],
    ]),
  )
  assert.deepEqual(
    summary?.total,
    new Map([
      ['USDC', '0.0082'],
      ['HYPE', '0.01'],
    ]),
  )
  assert.equal(summary?.approximateReason, null)
})

test('missing fees and shared closes make the totals approximate with the reason', () => {
  const summary = tradeFeeSummary({
    entry: [],
    exit: [],
    fills_without_fee: 2,
    apportioned: true,
  })

  assert.equal(summary?.total.size, 0)
  assert.equal(
    summary?.approximateReason,
    '2 fills arrived without a reported fee and are not counted. A close was shared with other trades or outside units; its fee is split by quantity.',
  )
  assert.equal(tradeFeeSummary(undefined), null)
})
