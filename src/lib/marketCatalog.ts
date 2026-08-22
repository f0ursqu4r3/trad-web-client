import type { ExchangeType, NetworkType } from './ws/protocol.ts'

export type MarketCatalogDomain = {
  exchange: ExchangeType
  network: NetworkType
}

type CacheEntry = {
  expiresAt: number
  symbols: Promise<string[]>
}

const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function loadMarketSymbols(domain: MarketCatalogDomain): Promise<string[]> {
  const key = `${domain.exchange}:${domain.network}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.symbols

  const symbols = fetchMarketSymbols(domain).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, symbols })
  return symbols
}

async function fetchMarketSymbols(domain: MarketCatalogDomain): Promise<string[]> {
  switch (domain.exchange) {
    case 'hyperliquid':
      return hyperliquidSymbols(domain.network)
    case 'bybit':
      return bybitSymbols(domain.network)
    case 'binance':
      return binanceSymbols(domain.network)
    case 'bifake':
      return ['APPLE']
    default:
      throw new Error(`Market catalog is unavailable for ${String(domain.exchange)}`)
  }
}

async function hyperliquidSymbols(network: NetworkType): Promise<string[]> {
  const host =
    network === 'mainnet' ? 'https://api.hyperliquid.xyz/' : 'https://api.hyperliquid-testnet.xyz/'
  const response = await catalogFetch(`${host}info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  })
  return parseHyperliquidSymbols(await response.json())
}

async function bybitSymbols(network: NetworkType): Promise<string[]> {
  const host = network === 'mainnet' ? 'https://api.bybit.com/' : 'https://api-testnet.bybit.com/'
  const url = new URL('v5/market/instruments-info', host)
  url.searchParams.set('category', 'linear')
  url.searchParams.set('limit', '1000')
  const response = await catalogFetch(url)
  return parseBybitSymbols(await response.json())
}

async function binanceSymbols(network: NetworkType): Promise<string[]> {
  const host =
    network === 'mainnet' ? 'https://fapi.binance.com/' : 'https://testnet.binancefuture.com/'
  const response = await catalogFetch(new URL('fapi/v1/exchangeInfo', host))
  return parseBinanceSymbols(await response.json())
}

async function catalogFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`Market catalog returned HTTP ${response.status}`)
  return response
}

export function parseHyperliquidSymbols(value: unknown): string[] {
  const universe = object(value).universe
  if (!Array.isArray(universe)) throw new Error('Hyperliquid market catalog is invalid')
  return normalizedSymbols(
    universe.filter((item) => object(item).isDelisted !== true).map((item) => object(item).name),
  )
}

export function parseBybitSymbols(value: unknown): string[] {
  const list = object(object(value).result).list
  if (!Array.isArray(list)) throw new Error('Bybit market catalog is invalid')
  return normalizedSymbols(
    list
      .filter((item) => {
        const instrument = object(item)
        return (
          instrument.status === 'Trading' &&
          instrument.quoteCoin === 'USDT' &&
          instrument.settleCoin === 'USDT'
        )
      })
      .map((item) => object(item).symbol),
  )
}

export function parseBinanceSymbols(value: unknown): string[] {
  const symbols = object(value).symbols
  if (!Array.isArray(symbols)) throw new Error('Binance market catalog is invalid')
  return normalizedSymbols(
    symbols
      .filter((item) => {
        const instrument = object(item)
        return (
          instrument.status === 'TRADING' &&
          instrument.contractType === 'PERPETUAL' &&
          instrument.quoteAsset === 'USDT' &&
          instrument.marginAsset === 'USDT'
        )
      })
      .map((item) => object(item).symbol),
  )
}

function normalizedSymbols(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))]
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
