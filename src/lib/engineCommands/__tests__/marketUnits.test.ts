import assert from 'node:assert/strict'
import test from 'node:test'

import type { AccountRecord } from '../../../stores/accounts.ts'
import { labelWithUnit, marketUnits } from '../marketUnits.ts'

test('Hyperliquid symbols are presented as BTC and USDC', () => {
  const units = marketUnits(
    {
      id: 'account',
      key: 'account',
      label: 'HL',
      exchange: 'hyperliquid' as AccountRecord['exchange'],
      network: 'mainnet' as AccountRecord['network'],
      exchange_metadata: { product: 'usdc_perp' },
    },
    'btc',
  )

  assert.deepEqual(units, { base: 'BTC', quote: 'USDC' })
})

test('centralized exchange suffixes are removed from base symbols', () => {
  const units = marketUnits(
    {
      id: 'account',
      key: 'account',
      label: 'Bybit',
      exchange: 'bybit' as AccountRecord['exchange'],
      network: 'mainnet' as AccountRecord['network'],
      exchange_metadata: { product: 'usdt_perp' },
    },
    'BTCUSDT',
  )

  assert.deepEqual(units, { base: 'BTC', quote: 'USDT' })
  assert.equal(labelWithUnit('Quote Notional', units.quote), 'Quote Notional (USDT)')
})
