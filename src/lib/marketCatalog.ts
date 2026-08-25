import type { ExchangeType, NetworkType } from './ws/protocol.ts'

export type MarketCatalogDomain = {
  exchange: ExchangeType
  network: NetworkType
}

export type MarketPriceRule =
  | { kind: 'hyperliquid_perpetual'; sizeDecimals: number }
  | { kind: 'fixed_tick'; tick: string }

type MarketCatalog = {
  symbols: string[]
  priceRules: Record<string, MarketPriceRule>
}

type CacheEntry = {
  expiresAt: number
  catalog: Promise<MarketCatalog>
}

const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export function loadMarketSymbols(domain: MarketCatalogDomain): Promise<string[]> {
  return loadMarketCatalog(domain).then((catalog) => catalog.symbols)
}

export function loadMarketPriceRule(
  domain: MarketCatalogDomain,
  symbol: string,
): Promise<MarketPriceRule | null> {
  return loadMarketCatalog(domain).then(
    (catalog) => catalog.priceRules[symbol.trim().toUpperCase()] ?? null,
  )
}

function loadMarketCatalog(domain: MarketCatalogDomain): Promise<MarketCatalog> {
  const key = `${domain.exchange}:${domain.network}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.catalog

  const catalog = fetchMarketCatalog(domain).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, catalog })
  return catalog
}

async function fetchMarketCatalog(domain: MarketCatalogDomain): Promise<MarketCatalog> {
  switch (domain.exchange) {
    case 'hyperliquid':
      return hyperliquidCatalog(domain.network)
    case 'bybit':
      return bybitCatalog(domain.network)
    case 'binance':
      return binanceCatalog(domain.network)
    case 'bifake':
      return { symbols: ['APPLE'], priceRules: { APPLE: { kind: 'fixed_tick', tick: '0.1' } } }
    default:
      throw new Error(`Market catalog is unavailable for ${String(domain.exchange)}`)
  }
}

async function hyperliquidCatalog(network: NetworkType): Promise<MarketCatalog> {
  const host =
    network === 'mainnet' ? 'https://api.hyperliquid.xyz/' : 'https://api.hyperliquid-testnet.xyz/'
  const response = await catalogFetch(`${host}info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  })
  return parseHyperliquidCatalog(await response.json())
}

async function bybitCatalog(network: NetworkType): Promise<MarketCatalog> {
  const host = network === 'mainnet' ? 'https://api.bybit.com/' : 'https://api-testnet.bybit.com/'
  const url = new URL('v5/market/instruments-info', host)
  url.searchParams.set('category', 'linear')
  url.searchParams.set('limit', '1000')
  const response = await catalogFetch(url)
  return parseBybitCatalog(await response.json())
}

async function binanceCatalog(network: NetworkType): Promise<MarketCatalog> {
  const host =
    network === 'mainnet' ? 'https://fapi.binance.com/' : 'https://testnet.binancefuture.com/'
  const response = await catalogFetch(new URL('fapi/v1/exchangeInfo', host))
  return parseBinanceCatalog(await response.json())
}

async function catalogFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`Market catalog returned HTTP ${response.status}`)
  return response
}

export function parseHyperliquidSymbols(value: unknown): string[] {
  return parseHyperliquidCatalog(value).symbols
}

export function parseHyperliquidCatalog(value: unknown): MarketCatalog {
  const universe = object(value).universe
  if (!Array.isArray(universe)) throw new Error('Hyperliquid market catalog is invalid')
  const instruments = universe.filter((item) => object(item).isDelisted !== true)
  const symbols = normalizedSymbols(instruments.map((item) => object(item).name))
  const priceRules: Record<string, MarketPriceRule> = {}
  for (const item of instruments) {
    const instrument = object(item)
    const symbol = normalizedSymbol(instrument.name)
    const sizeDecimals = instrument.szDecimals
    if (
      symbol !== null &&
      typeof sizeDecimals === 'number' &&
      Number.isInteger(sizeDecimals) &&
      sizeDecimals >= 0 &&
      sizeDecimals <= 6
    ) {
      priceRules[symbol] = { kind: 'hyperliquid_perpetual', sizeDecimals }
    }
  }
  return { symbols, priceRules }
}

export function parseBybitSymbols(value: unknown): string[] {
  return parseBybitCatalog(value).symbols
}

export function parseBybitCatalog(value: unknown): MarketCatalog {
  const list = object(object(value).result).list
  if (!Array.isArray(list)) throw new Error('Bybit market catalog is invalid')
  const instruments = list.filter((item) => {
    const instrument = object(item)
    return (
      instrument.status === 'Trading' &&
      instrument.quoteCoin === 'USDT' &&
      instrument.settleCoin === 'USDT'
    )
  })
  return fixedTickCatalog(
    instruments,
    (item) => object(item).symbol,
    (item) => object(object(item).priceFilter).tickSize,
  )
}

export function parseBinanceSymbols(value: unknown): string[] {
  return parseBinanceCatalog(value).symbols
}

export function parseBinanceCatalog(value: unknown): MarketCatalog {
  const symbols = object(value).symbols
  if (!Array.isArray(symbols)) throw new Error('Binance market catalog is invalid')
  const instruments = symbols.filter((item) => {
    const instrument = object(item)
    return (
      instrument.status === 'TRADING' &&
      instrument.contractType === 'PERPETUAL' &&
      instrument.quoteAsset === 'USDT' &&
      instrument.marginAsset === 'USDT'
    )
  })
  return fixedTickCatalog(
    instruments,
    (item) => object(item).symbol,
    (item) => {
      const filters = object(item).filters
      if (!Array.isArray(filters)) return null
      return object(filters.find((filter) => object(filter).filterType === 'PRICE_FILTER')).tickSize
    },
  )
}

function fixedTickCatalog(
  instruments: unknown[],
  symbolOf: (item: unknown) => unknown,
  tickOf: (item: unknown) => unknown,
): MarketCatalog {
  const symbols = normalizedSymbols(instruments.map(symbolOf))
  const priceRules: Record<string, MarketPriceRule> = {}
  for (const item of instruments) {
    const symbol = normalizedSymbol(symbolOf(item))
    const tick = tickOf(item)
    if (symbol !== null && validPositiveDecimal(tick)) {
      priceRules[symbol] = { kind: 'fixed_tick', tick }
    }
  }
  return { symbols, priceRules }
}

function normalizedSymbols(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))]
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function normalizedSymbol(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return symbol === '' ? null : symbol
}

function validPositiveDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value)
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
