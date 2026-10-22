import type { ExchangeType, NetworkType } from './ws/protocol.ts'

export type MarketCatalogDomain = {
  exchange: ExchangeType | 'hyperliquid' | 'bybit' | 'binance' | 'bifake'
  network: NetworkType | 'mainnet' | 'testnet'
}

export type MarketPriceRule =
  | { kind: 'hyperliquid_perpetual'; sizeDecimals: number }
  | { kind: 'fixed_tick'; tick: string }

// Hyperliquid terms of one market, from Trad's catalog
// (`GET /api/markets/hyperliquid/{network}`).
export type HyperliquidMarketTerms = {
  // null on the main dex; the HIP-3 dex name (`xyz`) otherwise.
  dex: string | null
  assetId: number
  // `cross` (cross allowed), `isolated_only` or `strict_isolated`.
  marginMode: string
  delisted: boolean
  growthMode: boolean
  // The account's tier rates times these give the market's exchange rates.
  takerFeeMultiplier: string
  makerFeeMultiplier: string
  makerRebateMultiplier: string
}

export type MarketInstrument = {
  // Trad's symbol, upper case (`XYZ:GOLD`): orders, leverage, subscriptions.
  symbol: string
  // The exchange's spelling for display (`xyz:GOLD`, `kPEPE`).
  venueSymbol: string
  // `main`, or the Hyperliquid HIP-3 dex (`xyz`).
  group: string
  maximumLeverage: number | null
  // False when Trad opens no new exposure on the market; existing orders and
  // positions can still be canceled and closed.
  tradable: boolean
  notTradableReason: string | null
  hyperliquid: HyperliquidMarketTerms | null
}

export type MarketCatalog = {
  // Every listed market, tradable or not, in catalog order.
  symbols: string[]
  priceRules: Record<string, MarketPriceRule>
  instruments: Record<string, MarketInstrument>
  // Hyperliquid's main market list, used while Trad's catalog is unavailable.
  fallback?: boolean
}

type CacheEntry = {
  expiresAt: number
  catalog: Promise<MarketCatalog>
}

const CACHE_MS = 5 * 60 * 1000
// A fallback list (Trad's catalog unavailable) is retried sooner.
const FALLBACK_CACHE_MS = 30 * 1000
const cache = new Map<string, CacheEntry>()

export function loadMarketSymbols(domain: MarketCatalogDomain): Promise<string[]> {
  return loadMarketCatalog(domain).then((catalog) => catalog.symbols)
}

export function loadMarketInstruments(domain: MarketCatalogDomain): Promise<MarketInstrument[]> {
  return loadMarketCatalog(domain).then((catalog) =>
    catalog.symbols.map((symbol) => catalog.instruments[symbol]!).filter(Boolean),
  )
}

export function loadMarketInstrument(
  domain: MarketCatalogDomain,
  symbol: string,
): Promise<MarketInstrument | null> {
  return loadMarketCatalog(domain).then(
    (catalog) => catalog.instruments[symbol.trim().toUpperCase()] ?? null,
  )
}

export function loadMarketPriceRule(
  domain: MarketCatalogDomain,
  symbol: string,
): Promise<MarketPriceRule | null> {
  return loadMarketCatalog(domain).then(
    (catalog) => catalog.priceRules[symbol.trim().toUpperCase()] ?? null,
  )
}

export function loadMarketCatalog(domain: MarketCatalogDomain): Promise<MarketCatalog> {
  const key = `${domain.exchange}:${domain.network}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.catalog

  const entry: CacheEntry = { expiresAt: Date.now() + CACHE_MS, catalog: Promise.resolve(null!) }
  entry.catalog = fetchMarketCatalog(domain).then(
    (loaded) => {
      if (loaded.fallback) entry.expiresAt = Date.now() + FALLBACK_CACHE_MS
      return loaded
    },
    (error) => {
      cache.delete(key)
      throw error
    },
  )
  cache.set(key, entry)
  return entry.catalog
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
      return {
        symbols: ['APPLE'],
        priceRules: { APPLE: { kind: 'fixed_tick', tick: '0.1' } },
        instruments: mainInstruments([{ symbol: 'APPLE' }], ['APPLE']),
      }
    default:
      throw new Error(`Market catalog is unavailable for ${String(domain.exchange)}`)
  }
}

// Trad's own catalog lists the main markets and the HIP-3 dexes Trad trades
// (`xyz`), with tradability and fee multipliers. Hyperliquid's main `meta`
// stays as the fallback when the gateway cannot answer.
async function hyperliquidCatalog(network: MarketCatalogDomain['network']): Promise<MarketCatalog> {
  try {
    const response = await catalogFetch(tradCatalogUrl('hyperliquid', network), {
      credentials: 'include',
    })
    return parseTradMarketCatalog(await response.json())
  } catch {
    return { ...(await hyperliquidMainCatalog(network)), fallback: true }
  }
}

function tradCatalogUrl(exchange: string, network: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const base = (env?.VITE_API_BASE || '/api').replace(/\/$/, '')
  return `${base}/markets/${exchange}/${network}`
}

async function hyperliquidMainCatalog(
  network: MarketCatalogDomain['network'],
): Promise<MarketCatalog> {
  const host =
    network === 'mainnet' ? 'https://api.hyperliquid.xyz/' : 'https://api.hyperliquid-testnet.xyz/'
  const response = await catalogFetch(`${host}info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  })
  return parseHyperliquidCatalog(await response.json())
}

async function bybitCatalog(network: MarketCatalogDomain['network']): Promise<MarketCatalog> {
  const host = network === 'mainnet' ? 'https://api.bybit.com/' : 'https://api-testnet.bybit.com/'
  const url = new URL('v5/market/instruments-info', host)
  url.searchParams.set('category', 'linear')
  url.searchParams.set('limit', '1000')
  const response = await catalogFetch(url)
  return parseBybitCatalog(await response.json())
}

async function binanceCatalog(network: MarketCatalogDomain['network']): Promise<MarketCatalog> {
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

// `MarketCatalogResponse` from the gateway.
export function parseTradMarketCatalog(value: unknown): MarketCatalog {
  const rows = object(value).instruments
  if (!Array.isArray(rows)) throw new Error('Trad market catalog is invalid')
  const symbols: string[] = []
  const priceRules: Record<string, MarketPriceRule> = {}
  const instruments: Record<string, MarketInstrument> = {}
  for (const row of rows) {
    const item = object(row)
    const symbol = normalizedSymbol(item.symbol)
    if (symbol === null || instruments[symbol] !== undefined) continue
    const venueSymbol =
      typeof item.venue_symbol === 'string' && item.venue_symbol.trim() !== ''
        ? item.venue_symbol.trim()
        : symbol
    const terms = object(item.hyperliquid)
    const hyperliquid: HyperliquidMarketTerms | null =
      item.hyperliquid === null || item.hyperliquid === undefined
        ? null
        : {
            dex: typeof terms.dex === 'string' && terms.dex !== '' ? terms.dex : null,
            assetId: typeof terms.asset_id === 'number' ? terms.asset_id : -1,
            marginMode: typeof terms.margin_mode === 'string' ? terms.margin_mode : 'cross',
            delisted: terms.delisted === true,
            growthMode: terms.growth_mode === true,
            takerFeeMultiplier: decimalText(terms.taker_fee_multiplier),
            makerFeeMultiplier: decimalText(terms.maker_fee_multiplier),
            makerRebateMultiplier: decimalText(terms.maker_rebate_multiplier),
          }
    const tradable = item.tradable !== false
    instruments[symbol] = {
      symbol,
      venueSymbol,
      group: typeof item.group === 'string' && item.group !== '' ? item.group : 'main',
      maximumLeverage:
        typeof item.maximum_leverage === 'number' && item.maximum_leverage > 0
          ? item.maximum_leverage
          : null,
      tradable,
      notTradableReason: tradable
        ? null
        : typeof item.not_tradable_reason === 'string' && item.not_tradable_reason !== ''
          ? item.not_tradable_reason
          : `${venueSymbol} is not tradable on Trad`,
      hyperliquid,
    }
    symbols.push(symbol)
    const rule = object(item.price_rule)
    if (
      rule.kind === 'hyperliquid_perpetual' &&
      typeof rule.size_decimals === 'number' &&
      Number.isInteger(rule.size_decimals) &&
      rule.size_decimals >= 0 &&
      rule.size_decimals <= 6
    ) {
      priceRules[symbol] = { kind: 'hyperliquid_perpetual', sizeDecimals: rule.size_decimals }
    } else if (rule.kind === 'fixed_tick' && validPositiveDecimal(rule.tick)) {
      priceRules[symbol] = { kind: 'fixed_tick', tick: rule.tick }
    }
  }
  return { symbols, priceRules, instruments }
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
  return { symbols, priceRules, instruments: mainInstruments(instruments, symbols) }
}

function mainInstruments(rows: unknown[], symbols: string[]): Record<string, MarketInstrument> {
  const venueNames = new Map<string, string>()
  const leverage = new Map<string, number>()
  for (const row of rows) {
    const item = object(row)
    const symbol = normalizedSymbol(item.name ?? item.symbol)
    if (symbol === null) continue
    if (typeof item.name === 'string') venueNames.set(symbol, item.name.trim())
    if (typeof item.maxLeverage === 'number') leverage.set(symbol, item.maxLeverage)
  }
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      {
        symbol,
        venueSymbol: venueNames.get(symbol) ?? symbol,
        group: 'main',
        maximumLeverage: leverage.get(symbol) ?? null,
        tradable: true,
        notTradableReason: null,
        hyperliquid: null,
      },
    ]),
  )
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
  return { symbols, priceRules, instruments: mainInstruments(instruments, symbols) }
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

function decimalText(value: unknown): string {
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : '1'
}

function validPositiveDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value)
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
