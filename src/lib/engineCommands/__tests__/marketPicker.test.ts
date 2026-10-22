import assert from 'node:assert/strict'
import test from 'node:test'

import type { MarketCatalogState } from '../../gateway/marketSubscriptionPolicy.ts'
import {
  marketPickerCommit,
  marketPickerPending,
  marketPickerValidity,
} from '../../marketPicker.ts'

const catalog: MarketCatalogState = { status: 'ready', symbols: ['BTC', 'ETH', 'SOL', 'ZEC'] }

test('typing alone never changes the ticket market', () => {
  // Every keystroke of "ZEC" leaves BTC selected until the trader selects.
  for (const text of ['Z', 'ZE', 'ZEC']) {
    assert.equal(marketPickerPending(text, 'BTC'), true)
  }
  assert.equal(marketPickerPending(' btc ', 'BTC'), false)
})

test('Enter selects the highlighted option, or an exact listed match', () => {
  assert.equal(
    marketPickerCommit('ZE', 'BTC', catalog, { kind: 'enter', highlighted: 'ZEC' }),
    'ZEC',
  )
  assert.equal(
    marketPickerCommit('zec', 'BTC', catalog, { kind: 'enter', highlighted: null }),
    'ZEC',
  )
  // A partial or unlisted symbol is never selected.
  assert.equal(marketPickerCommit('ZE', 'BTC', catalog, { kind: 'enter', highlighted: null }), null)
  assert.equal(
    marketPickerCommit('ZZZ', 'BTC', catalog, { kind: 'enter', highlighted: null }),
    null,
  )
  // Enter on the market already selected changes nothing.
  assert.equal(
    marketPickerCommit('BTC', 'BTC', catalog, { kind: 'enter', highlighted: 'BTC' }),
    null,
  )
  assert.equal(marketPickerCommit('', 'BTC', catalog, { kind: 'enter', highlighted: null }), null)
})

test('clicking an option selects it', () => {
  assert.equal(marketPickerCommit('E', 'BTC', catalog, { kind: 'pick', symbol: 'ETH' }), 'ETH')
  assert.equal(marketPickerCommit('E', 'BTC', catalog, { kind: 'pick', symbol: 'DOGE' }), null)
})

test('leaving the field selects only an exact listed match', () => {
  assert.equal(marketPickerCommit('ZEC', 'BTC', catalog, { kind: 'blur' }), 'ZEC')
  assert.equal(marketPickerCommit('ZE', 'BTC', catalog, { kind: 'blur' }), null)
  // Emptying the field and leaving it clears the market.
  assert.equal(marketPickerCommit('', 'BTC', catalog, { kind: 'blur' }), '')
  assert.equal(marketPickerCommit('', '', catalog, { kind: 'blur' }), null)
})

test('without a catalog the typed symbol is manual entry on Enter or blur', () => {
  for (const state of [{ status: 'unavailable' }, { status: 'loading' }] as const) {
    assert.equal(marketPickerCommit('doge', 'BTC', state, { kind: 'blur' }), 'DOGE')
    assert.equal(
      marketPickerCommit('DOGE', 'BTC', state, { kind: 'enter', highlighted: null }),
      'DOGE',
    )
  }
})

test('the field explains an unselected market only once the trader leaves it', () => {
  assert.equal(marketPickerValidity('ZE', 'BTC', catalog, true), null)
  assert.equal(
    marketPickerValidity('ZE', 'BTC', catalog, false),
    'ZE is not available for this account',
  )
  assert.equal(marketPickerValidity('BTC', 'BTC', catalog, false), null)
  // A market set from outside that the catalog does not list.
  assert.equal(
    marketPickerValidity('DOGE', 'DOGE', catalog, false),
    'DOGE is not available for this account',
  )
  assert.equal(marketPickerValidity('ZE', 'BTC', { status: 'unavailable' }, false), null)
})
