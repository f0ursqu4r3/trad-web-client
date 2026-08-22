import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseBinanceSymbols,
  parseBybitSymbols,
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
