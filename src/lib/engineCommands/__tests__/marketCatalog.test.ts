import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseBinanceCatalog,
  parseBinanceSymbols,
  parseBybitCatalog,
  parseBybitSymbols,
  parseHyperliquidCatalog,
  parseHyperliquidSymbols,
} from '../../marketCatalog.ts'

test('Hyperliquid catalog excludes delisted markets', () => {
  assert.deepEqual(
    parseHyperliquidSymbols({
      universe: [{ name: 'BTC' }, { name: 'MATIC', isDelisted: true }, { name: 'eth' }],
    }),
    ['BTC', 'ETH'],
  )
})

test('Hyperliquid catalog retains perp price precision rules', () => {
  const catalog = parseHyperliquidCatalog({
    universe: [
      { name: 'BTC', szDecimals: 5 },
      { name: 'ETH', szDecimals: 4 },
      { name: 'OLD', szDecimals: 2, isDelisted: true },
    ],
  })
  assert.deepEqual(catalog.priceRules, {
    BTC: { kind: 'hyperliquid_perpetual', sizeDecimals: 5 },
    ETH: { kind: 'hyperliquid_perpetual', sizeDecimals: 4 },
  })
})

test('Bybit catalog retains trading linear USDT markets', () => {
  assert.deepEqual(
    parseBybitSymbols({
      result: {
        list: [
          { symbol: 'BTCUSDT', status: 'Trading', quoteCoin: 'USDT', settleCoin: 'USDT' },
          { symbol: 'BTCUSD', status: 'Trading', quoteCoin: 'USD', settleCoin: 'BTC' },
        ],
      },
    }),
    ['BTCUSDT'],
  )
})

test('Bybit catalog retains fixed price ticks', () => {
  const catalog = parseBybitCatalog({
    result: {
      list: [
        {
          symbol: 'BTCUSDT',
          status: 'Trading',
          quoteCoin: 'USDT',
          settleCoin: 'USDT',
          priceFilter: { tickSize: '0.10' },
        },
      ],
    },
  })
  assert.deepEqual(catalog.priceRules.BTCUSDT, { kind: 'fixed_tick', tick: '0.10' })
})

test('Binance catalog retains trading perpetual USDT markets', () => {
  assert.deepEqual(
    parseBinanceSymbols({
      symbols: [
        {
          symbol: 'ETHUSDT',
          status: 'TRADING',
          contractType: 'PERPETUAL',
          quoteAsset: 'USDT',
          marginAsset: 'USDT',
        },
        {
          symbol: 'ETHUSDT_260925',
          status: 'TRADING',
          contractType: 'CURRENT_QUARTER',
          quoteAsset: 'USDT',
          marginAsset: 'USDT',
        },
      ],
    }),
    ['ETHUSDT'],
  )
})

test('Binance catalog retains PRICE_FILTER ticks', () => {
  const catalog = parseBinanceCatalog({
    symbols: [
      {
        symbol: 'ETHUSDT',
        status: 'TRADING',
        contractType: 'PERPETUAL',
        quoteAsset: 'USDT',
        marginAsset: 'USDT',
        filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.01' }],
      },
    ],
  })
  assert.deepEqual(catalog.priceRules.ETHUSDT, { kind: 'fixed_tick', tick: '0.01' })
})
